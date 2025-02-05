import { networks, Psbt, Transaction } from "bitcoinjs-lib";
import { EventEmitter } from "events";
import { StakingParams, VersionedStakingParams } from "../types/params";
import { UTXO } from "../types";
import { StakerInfo, Staking } from ".";
import { fromBech32 } from "@cosmjs/encoding";
import {
  btccheckpoint,
  btcstaking,
  btcstakingtx,
} from "@babylonlabs-io/babylon-proto-ts";
import {
  BTCSigType,
  ProofOfPossessionBTC,
} from "@babylonlabs-io/babylon-proto-ts/dist/generated/babylon/btcstaking/v1/pop";
import { BABYLON_REGISTRY_TYPE_URLS } from "../constants/registry";
import { createCovenantWitness } from "./transactions";
import { getBabylonParamByBtcHeight, getBabylonParamByVersion } from "../utils/staking/param";
import { reverseBuffer, uint8ArrayToHex } from "../utils";
import { deriveStakingOutputInfo } from "../utils/staking";
import { findMatchingTxOutputIndex } from "../utils/staking";

export interface BtcProvider {
  // Sign a PSBT
  signPsbt(psbtHex: string): Promise<string>;
  // Sign a message using the ECDSA type
  // This is optional and only required if you would like to use the 
  // `createProofOfPossession` function
  signMessage?: (message: string, type: "ecdsa") => Promise<string>;
  // Get the staker info
  getStakerInfo(): Promise<StakerInfo>;
  // Get the available UTXOs for staking
  getUTXOs(): Promise<UTXO[]>;
}

export interface BabylonProvider {
  // Get the Babylon BTC tip height. Note there might be a delay between
  // the BTC tip height and the Babylon BTC tip height. You should not use the
  // BTC tip height to determine the Babylon param.
  getBabylonBtcTipHeight(): Promise<number>;
  // Get the Babylon Chain address
  getBabylonAddress(): Promise<string>;
  // Sign a babylon transaction.
  signTransaction: <T extends object>(msg: {
    typeUrl: string;
    value: T;
  }) => Promise<Uint8Array>
}

// Event types for the BabylonBtcStakingManager
export enum StakingEventType {
  SIGNING = "signing",
}

// Event types for the Signing event
export enum SigningType {
  STAKING_SLASHING = "staking-slashing",
  UNBONDING_SLASHING = "unbonding-slashing",
  PROOF_OF_POSSESSION = "proof-of-possession",
  CREATE_BTC_DELEGATION_MSG = "create-btc-delegation-msg",
}

interface StakingEventMap {
  [StakingEventType.SIGNING]: SigningType;
}

interface StakingInputs {
  finalityProviderPkNoCoordHex: string;
  stakingAmountSat: number;
  stakingTimelock: number;
}

// Inclusion proof for a BTC staking transaction that is included in a BTC block
// This is used for post-staking registration on the Babylon chain
// You can refer to https://electrumx.readthedocs.io/en/latest/protocol-methods.html#blockchain-transaction-get-merkle
// for more information on the inclusion proof format.
interface InclusionProof {
  // The 0-based index of the position of the transaction in the ordered list 
  // of transactions in the block.
  pos: number;
  // A list of transaction hashes the current hash is paired with, recursively, 
  // in order to trace up to obtain merkle root of the block, deepest pairing first.
  merkle: string[];
  // The block hash of the block that contains the transaction
  blockHashHex: string;
}

export class BabylonBtcStakingManager extends EventEmitter {
  private stakingParams: VersionedStakingParams[];
  private btcProvider: BtcProvider;
  private network: networks.Network;
  private babylonProvider: BabylonProvider;

  constructor(
    network: networks.Network,
    stakingParams: VersionedStakingParams[],
    btcProvider: BtcProvider,
    babylonProvider: BabylonProvider,
  ) {
    super(); // Initialize EventEmitter
    this.network = network;
    this.btcProvider = btcProvider;
    this.babylonProvider = babylonProvider;

    if (stakingParams.length === 0) {
      throw new Error("No staking parameters provided");
    }
    this.stakingParams = stakingParams;
  }

  /**
   * Creates an signed Pre-Staking Registration transaction that is ready to be 
   * sent to the Babylon chain.
   * @param stakingInput - The staking inputs.
   * @param feeRate - The fee rate in satoshis per byte.
   * @returns The signed babylon pre-staking registration transaction in base64 
   * format.
   */
  async preStakeRegistrationBabylondTransaction(
    stakingInput: StakingInputs,
    feeRate: number,
  ): Promise<{
    signedBabylonTx: Uint8Array;
    stakingTx: Transaction;
  }> {
    const tipHeight = await this.babylonProvider.getBabylonBtcTipHeight();
    if (tipHeight === 0) {
      throw new Error("Babylon BTC tip height cannot be 0");
    }
    const inputUTXOs = await this.btcProvider.getUTXOs();
    if (inputUTXOs.length === 0) {
      throw new Error("No input UTXOs provided");
    }
    const bech32Address = await this.babylonProvider.getBabylonAddress();
    if (!bech32Address) {
      throw new Error("Babylon address cannot be empty");
    }

    // Get the Babylon param based on the BTC tip height from Babylon chain
    const params = getBabylonParamByBtcHeight(tipHeight, this.stakingParams);
    if (!params) {
      throw new Error(`Unable to find staking params for height ${tipHeight}`);
    }
    
    const stakerInfo = await this.btcProvider.getStakerInfo();

    const staking = new Staking(
      this.network,
      stakerInfo,
      params,
      stakingInput.finalityProviderPkNoCoordHex,
      stakingInput.stakingTimelock,
    );

    // Create unsigned staking transaction
    const { transaction } = staking.createStakingTransaction(
      stakingInput.stakingAmountSat,
      inputUTXOs,
      feeRate,
    );

    // Create delegation message without including inclusion proof
    const msg = await this.createBtcDelegationMsg(
      staking,
      stakingInput,
      transaction,
      bech32Address,
      stakerInfo,
      params,
    );

    return {
      signedBabylonTx: await this.babylonProvider.signTransaction(msg),
      stakingTx: transaction,
    };
  }

  /**
   * Creates a signed post-staking registration transaction that is ready to be 
   * sent to the Babylon chain. This is used when a staking transaction is 
   * already created and included in a BTC block and we want to register it on 
   * the Babylon chain.
   * @param stakingTx - The staking transaction.
   * @param stakingTxHeight - The BTC height in which the staking transaction 
   * is included.
   * @param stakingInput - The staking inputs.
   * @param inclusionProof - The inclusion proof of the staking transaction.
   * @returns The signed babylon transaction in base64 format.
   */
  async postStakeRegistrationBabylonTransaction(
    stakingTx: Transaction,
    stakingTxHeight: number,
    stakingInput: StakingInputs,
    inclusionProof: InclusionProof,
  ): Promise<{
    signedBabylonTx: Uint8Array;
  }> {
    // Get the Babylon param at the time of the staking transaction
    const params = getBabylonParamByBtcHeight(stakingTxHeight, this.stakingParams);
    if (!params)
      throw new Error(
        `Unable to find staking params for height ${stakingTxHeight}`,
      );
    
    const stakerBtcInfo = await this.btcProvider.getStakerInfo();
    if (!stakerBtcInfo) {
      throw new Error("Staker info not found while registering delegation");
    }

    const bech32Address = await this.babylonProvider.getBabylonAddress();
    if (!bech32Address) {
      throw new Error("Babylon address cannot be empty");
    }

    const stakingInstance = new Staking(
      this.network,
      stakerBtcInfo,
      params,
      stakingInput.finalityProviderPkNoCoordHex,
      stakingInput.stakingTimelock,
    );

    // Validate if the stakingTx is valid based on the retrieved Babylon param
    const scripts =stakingInstance.buildScripts();
    const stakingOutputInfo = deriveStakingOutputInfo(scripts, this.network);
    // Error will be thrown if the expected staking output address is not found
    // in the stakingTx
    findMatchingTxOutputIndex(
      stakingTx,
      stakingOutputInfo.outputAddress,
      this.network,
    )

    // Create delegation message
    const delegationMsg = await this.createBtcDelegationMsg(
      stakingInstance,
      stakingInput,
      stakingTx,
      bech32Address,
      stakerBtcInfo,
      params,
      this.getInclusionProof(inclusionProof),
    );

    return {
      signedBabylonTx: await this.babylonProvider.signTransaction(delegationMsg),
    };
  }

  /**
   * Estimates the BTC fee required for staking.
   * @param stakingInput - The staking inputs.
   * @param feeRate - The fee rate in satoshis per byte.
   * @returns The estimated BTC fee in satoshis.
   */
  async estimateStakingBtcFee(
    stakingInput: StakingInputs,
    feeRate: number,
  ): Promise<number> {
    const tipHeight = await this.babylonProvider.getBabylonBtcTipHeight();
    if (tipHeight === 0) {
      throw new Error("Babylon BTC tip height cannot be 0");
    }
    // Get the param based on the tip height
    const params = getBabylonParamByBtcHeight(tipHeight, this.stakingParams);
    if (!params) {
      throw new Error(`Unable to find staking params for height ${tipHeight}`);
    }
    
    const stakerInfo = await this.btcProvider.getStakerInfo();
    if (!stakerInfo) {
      throw new Error("Staker info not found while estimating staking fee");
    }

    const inputUTXOs = await this.btcProvider.getUTXOs();
    if (inputUTXOs.length === 0) {
      throw new Error("No input UTXOs provided");
    }

    const staking = new Staking(
      this.network,
      stakerInfo,
      params,
      stakingInput.finalityProviderPkNoCoordHex,
      stakingInput.stakingTimelock,
    );

    const { fee: stakingFee } = staking.createStakingTransaction(
      stakingInput.stakingAmountSat,
      inputUTXOs,
      feeRate,
    );

    return stakingFee;
  }

  /**
   * Creates a signed staking transaction that is ready to be sent to the BTC 
   * network.
   * @param stakingInput - The staking inputs.
   * @param unsignedStakingTx - The unsigned staking transaction.
   * @param stakingParamVersion - The param version that was used to create the EOI
   * @returns The signed staking transaction.
   */
  async createSignedBtcStakingTransaction(
    stakingInput: StakingInputs,
    unsignedStakingTx: Transaction,
    stakingParamVersion: number,
  ): Promise<Transaction> {
    // Get the param based on version from the EOI
    const params = getBabylonParamByVersion(stakingParamVersion, this.stakingParams);
    if (!params) {
      throw new Error(`Unable to find staking params for version ${stakingParamVersion}`);
    }
    const stakerInfo = await this.btcProvider.getStakerInfo();
    if (!stakerInfo) {
      throw new Error("Staker info not found while creating signed staking transaction");
    }
    const inputUTXOs = await this.btcProvider.getUTXOs();
    if (inputUTXOs.length === 0) {
      throw new Error("No input UTXOs provided");
    }

    const staking = new Staking(
      this.network,
      stakerInfo,
      params,
      stakingInput.finalityProviderPkNoCoordHex,
      stakingInput.stakingTimelock,
    );

    const stakingPsbt = staking.toStakingPsbt(
      unsignedStakingTx,
      inputUTXOs,
    );

    const signedStakingPsbtHex = await this.btcProvider.signPsbt(
      stakingPsbt.toHex()
    );
    return Psbt.fromHex(signedStakingPsbtHex).extractTransaction();
  }

  /**
   * Creates a signed unbonding transaction that is ready to be sent to the BTC 
   * network.
   * @param stakingInput - The staking inputs.
   * @param stakingParamVersion - The param version that was used to create the 
   * EOI
   * @param stakingTx - The staking transaction.
   * @param unsignedUnbondingTx - The unsigned unbonding transaction.
   * @param covenantUnbondingSignatures - The covenant unbonding signatures.
   * It can be retrieved from the Babylon chain or API.
   * @returns The signed unbonding transaction.
   */
  async createSignedBtcUnbondingTransaction(
    stakingInput: StakingInputs,
    stakingParamVersion: number,
    stakingTx: Transaction,
    unsignedUnbondingTx: Transaction,
    covenantUnbondingSignatures: {
      btcPkHex: string;
      sigHex: string;
    }[],
  ): Promise<Transaction> {
    // Get the staking params at the time of the staking transaction
    const params = getBabylonParamByVersion(stakingParamVersion, this.stakingParams);
    if (!params) {
      throw new Error(
        `Unable to find staking params for version ${stakingParamVersion}`,
      );
    }

    const stakerInfo = await this.btcProvider.getStakerInfo();
    if (!stakerInfo) {
      throw new Error(
        "Staker info not found while creating signed unbonding transaction",
      );
    }

    const staking = new Staking(
      this.network,
      stakerInfo,
      params,
      stakingInput.finalityProviderPkNoCoordHex,
      stakingInput.stakingTimelock,
    );

    const unbondingPsbt = staking.toUnbondingPsbt(
      unsignedUnbondingTx,
      stakingTx,
    );
    const signedUnbondingPsbtHex = await this.btcProvider.signPsbt(
      unbondingPsbt.toHex()
    );
    const signedUnbondingTx = Psbt
      .fromHex(signedUnbondingPsbtHex).extractTransaction();

    // Add covenant unbonding signatures
    // Convert the params of covenants to buffer
    const covenantBuffers = params.covenantNoCoordPks.map((covenant) =>
      Buffer.from(covenant, "hex"),
    );
    const witness = createCovenantWitness(
      // Since unbonding transactions always have a single input and output,
      // we expect exactly one signature in TaprootScriptSpendSig when the
      // signing is successful
      signedUnbondingTx.ins[0].witness,
      covenantBuffers,
      covenantUnbondingSignatures,
      params.covenantQuorum,
    );
    // Overwrite the witness to include the covenant unbonding signatures
    signedUnbondingTx.ins[0].witness = witness;

    return signedUnbondingTx;
  }

  /**
   * Creates a signed withdrawal transaction on the unbodning output expiry path 
   * that is ready to be sent to the BTC network.
   * @param stakingInput - The staking inputs.
   * @param stakingParamVersion - The param version that was used to create the
   * delegation in Babylon chain
   * @param earlyUnbondingTx - The early unbonding transaction.
   * @param feeRate - The fee rate in satoshis per byte.
   * @returns The signed withdrawal transaction.
   */
  async createSignedWithdrawEarlyUnbondedBtcTransaction(
    stakingInput: StakingInputs,
    stakingParamVersion: number,
    earlyUnbondingTx: Transaction,
    feeRate: number,
  ): Promise<Transaction> {
    const params = getBabylonParamByVersion(stakingParamVersion, this.stakingParams);
    if (!params) {
      throw new Error(
        `Unable to find staking params for version ${stakingParamVersion}`,
      );
    }

    const stakerInfo = await this.btcProvider.getStakerInfo();
    if (!stakerInfo) {
      throw new Error("Staker info not found while creating signed unbonding transaction");
    }

    const staking = new Staking(
      this.network,
      stakerInfo,
      params,
      stakingInput.finalityProviderPkNoCoordHex,
      stakingInput.stakingTimelock,
    );

    const { psbt: unbondingPsbt } = staking.createWithdrawEarlyUnbondedTransaction(
      earlyUnbondingTx,
      feeRate,
    );

    const signedWithdrawalPsbtHex = await this.btcProvider.signPsbt(
      unbondingPsbt.toHex()
    );
    return Psbt.fromHex(signedWithdrawalPsbtHex).extractTransaction();
  }

  /**
   * Creates a signed withdrawal transaction on the staking output expiry path 
   * that is ready to be sent to the BTC network.
   * @param stakingInput - The staking inputs.
   * @param stakingParamVersion - The param version that was used to create the EOI
   * @param stakingTx - The staking transaction.
   * @param feeRate - The fee rate in satoshis per byte.
   * @returns The signed withdrawal transaction.
   */
  async createSignedWithdrawStakingExpiredBtcTransaction(
    stakingInput: StakingInputs,
    stakingParamVersion: number,
    stakingTx: Transaction,
    feeRate: number,
  ): Promise<Transaction> {
    const params = getBabylonParamByVersion(stakingParamVersion, this.stakingParams);
    if (!params) {
      throw new Error(`Unable to find staking params for version ${stakingParamVersion}`);
    }

    const stakerInfo = await this.btcProvider.getStakerInfo();
    if (!stakerInfo) {
      throw new Error("Staker info not found while creating signed unbonding transaction");
    }

    const staking = new Staking(
      this.network,
      stakerInfo,
      params,
      stakingInput.finalityProviderPkNoCoordHex,
      stakingInput.stakingTimelock,
    );

    const { psbt } = staking.createWithdrawStakingExpiredPsbt(
      stakingTx,
      feeRate,
    );

    const signedWithdrawalPsbtHex = await this.btcProvider.signPsbt(
      psbt.toHex()
    );
    return Psbt.fromHex(signedWithdrawalPsbtHex).extractTransaction();
  }

  /**
   * Creates a signed withdrawal transaction for the expired slashing output that 
   * ready to be sent to the BTC network.
   * @param stakingInput - The staking inputs.
   * @param stakingParamVersion - The param version that was used to create the EOI
   * @param slashingTx - The slashing transaction.
   * @param feeRate - The fee rate in satoshis per byte.
   * @returns The signed withdrawal transaction.
   */
  async createSignedWithdrawSlashingBtcTransaction(
    stakingInput: StakingInputs,
    stakingParamVersion: number,
    slashingTx: Transaction,
    feeRate: number,
  ): Promise<Transaction> {
    const params = getBabylonParamByVersion(stakingParamVersion, this.stakingParams);
    if (!params) {
      throw new Error(`Unable to find staking params for version ${stakingParamVersion}`);
    }

    const stakerInfo = await this.btcProvider.getStakerInfo();
    if (!stakerInfo) {
      throw new Error("Staker info not found while creating withdraw slashing transaction");
    }

    const staking = new Staking(
      this.network,
      stakerInfo,
      params,
      stakingInput.finalityProviderPkNoCoordHex,
      stakingInput.stakingTimelock,
    );

    const { psbt } = staking.createWithdrawSlashingPsbt(
      slashingTx,
      feeRate,
    );

    const signedSlashingPsbtHex = await this.btcProvider.signPsbt(
      psbt.toHex()
    );
    return Psbt.fromHex(signedSlashingPsbtHex).extractTransaction();
  }

  /**
   * Creates a proof of possession for the staker based on ECDSA signature.
   * @param bech32Address - The staker's bech32 address.
   * @returns The proof of possession.
   */
  async createProofOfPossession(
    bech32Address: string,
  ): Promise<ProofOfPossessionBTC> {
    if (!this.btcProvider.signMessage) {
      throw new Error("Sign message function not found");
    }
    // Create Proof of Possession
    const bech32AddressHex = uint8ArrayToHex(fromBech32(bech32Address).data);
    const signedBabylonAddress = await this.btcProvider.signMessage(
      bech32AddressHex,
      "ecdsa",
    );
    const ecdsaSig = Uint8Array.from(Buffer.from(signedBabylonAddress, "base64"));
    return {
      btcSigType: BTCSigType.ECDSA,
      btcSig: ecdsaSig,
    };
  }

  /**
   * Adds an event listener for a specific event type.
   * @param event - The event type to listen for.
   * @param listener - The listener function to be called when the event occurs.
   * @returns The current event emitter instance.
   */
  on<K extends keyof StakingEventMap>(
    event: K,
    listener: (message: StakingEventMap[K]) => void
  ): this {
    return super.on(event, listener);
  }

  /**
   * Removes an event listener for a specific event type.
   * @param event - The event type to stop listening for.
   * @param listener - The listener function to remove.
   * @returns The current event emitter instance.
   */
  off<K extends keyof StakingEventMap>(
    event: K,
    listener: (message: StakingEventMap[K]) => void
  ): this {
    return super.off(event, listener);
  }

  /**
   * Creates the unbonding, slashing, and unbonding slashing transactions and 
   * PSBTs.
   * @param stakingInstance - The staking instance.
   * @param stakingTx - The staking transaction.
   * @returns The unbonding, slashing, and unbonding slashing transactions and 
   * PSBTs.
   */
  private async createDelegationTransactionsAndPsbts(
    stakingInstance: Staking,
    stakingTx: Transaction,
  ) {
    const { transaction: unbondingTx } =
    stakingInstance.createUnbondingTransaction(stakingTx);

    // Create slashing transactions and extract signatures
    const { psbt: slashingPsbt } =
      stakingInstance.createStakingOutputSlashingPsbt(stakingTx);

    const { psbt: unbondingSlashingPsbt } =
    stakingInstance.createUnbondingOutputSlashingPsbt(unbondingTx);

    return {
      unbondingTx,
      slashingPsbt,
      unbondingSlashingPsbt,
    };
  }

  /**
   * Creates a protobuf message for the BTC delegation.
   * @param stakingInstance - The staking instance.
   * @param stakingInput - The staking inputs.
   * @param stakingTx - The staking transaction.
   * @param bech32Address - The staker's babylon chain bech32 address
   * @param stakerBtcInfo - The staker's BTC information such as address and 
   * public key
   * @param param - The staking parameters.
   * @param inclusionProof - The inclusion proof of the staking transaction.
   * @returns The protobuf message.
   */
  private async createBtcDelegationMsg(
    stakingInstance: Staking,
    stakingInput: StakingInputs,
    stakingTx: Transaction,
    bech32Address: string,
    stakerBtcInfo: StakerInfo,
    param: StakingParams,
    inclusionProof?: btcstaking.InclusionProof,
  ) {
    const {
      unbondingTx,
      slashingPsbt,
      unbondingSlashingPsbt
    } = await this.createDelegationTransactionsAndPsbts(
      stakingInstance,
      stakingTx,
    );

    // Sign the slashing PSBT
    const signedSlashingPsbtHex = await this.btcProvider.signPsbt(
      slashingPsbt.toHex(),
    );
    const signedSlashingTx = Psbt.fromHex(
      signedSlashingPsbtHex,
    ).extractTransaction();
    const slashingSig = extractFirstSchnorrSignatureFromTransaction(
      signedSlashingTx
    );
    if (!slashingSig) {
      throw new Error("No signature found in the staking output slashing PSBT");
    }

    // Sign the unbonding slashing PSBT
    const signedUnbondingSlashingPsbtHex = await this.btcProvider.signPsbt(
      unbondingSlashingPsbt.toHex(),
    );
    const signedUnbondingSlashingTx = Psbt.fromHex(
      signedUnbondingSlashingPsbtHex,
    ).extractTransaction();
    const unbondingSignatures = extractFirstSchnorrSignatureFromTransaction(
      signedUnbondingSlashingTx,
    );
    if (!unbondingSignatures) {
      throw new Error("No signature found in the unbonding output slashing PSBT");
    }

    // Create proof of possession
    const proofOfPossession = await this.createProofOfPossession(bech32Address);

    // Prepare the final protobuf message
    const msg: btcstakingtx.MsgCreateBTCDelegation =
      btcstakingtx.MsgCreateBTCDelegation.fromPartial({
        stakerAddr: bech32Address,
        pop: proofOfPossession,
        btcPk: Uint8Array.from(
          Buffer.from(stakerBtcInfo.publicKeyNoCoordHex, "hex"),
        ),
        fpBtcPkList: [
          Uint8Array.from(
            Buffer.from(stakingInput.finalityProviderPkNoCoordHex, "hex"),
          ),
        ],
        stakingTime: stakingInput.stakingTimelock,
        stakingValue: stakingInput.stakingAmountSat,
        stakingTx: Uint8Array.from(stakingTx.toBuffer()),
        slashingTx: Uint8Array.from(
          Buffer.from(clearTxSignatures(signedSlashingTx).toHex(), "hex"),
        ),
        delegatorSlashingSig: Uint8Array.from(slashingSig),
        unbondingTime: param.unbondingTime,
        unbondingTx: Uint8Array.from(unbondingTx.toBuffer()),
        unbondingValue: stakingInput.stakingAmountSat - param.unbondingFeeSat,
        unbondingSlashingTx: Uint8Array.from(
          Buffer.from(
            clearTxSignatures(signedUnbondingSlashingTx).toHex(),
            "hex",
          ),
        ),
        delegatorUnbondingSlashingSig: Uint8Array.from(unbondingSignatures),
        stakingTxInclusionProof: inclusionProof,
      });

    return {
      typeUrl: BABYLON_REGISTRY_TYPE_URLS.MsgCreateBTCDelegation,
      value: msg,
    };
  };

  /**
   * Gets the inclusion proof for the staking transaction.
   * See the type `InclusionProof` for more information
   * @param inclusionProof - The inclusion proof.
   * @returns The inclusion proof.
   */
  private getInclusionProof(
    inclusionProof: InclusionProof,
  ): btcstaking.InclusionProof {
    const {
      pos,
      merkle,
      blockHashHex
    } = inclusionProof;
    const proofHex = deriveMerkleProof(merkle);
  
    const hash = reverseBuffer(Uint8Array.from(Buffer.from(blockHashHex, "hex")));
    const inclusionProofKey: btccheckpoint.TransactionKey =
      btccheckpoint.TransactionKey.fromPartial({
        index: pos,
        hash,
      });
    return btcstaking.InclusionProof.fromPartial({
      key: inclusionProofKey,
      proof: Uint8Array.from(Buffer.from(proofHex, "hex")),
    });
  };
}

/**
 * Extracts the first valid Schnorr signature from a signed transaction.
 * 
 * Since we only handle transactions with a single input and request a signature
 * for one public key, there can be at most one signature from the Bitcoin node.
 * A valid Schnorr signature is exactly 64 bytes in length.
 * 
 * @param singedTransaction - The signed Bitcoin transaction to extract the signature from
 * @returns The first valid 64-byte Schnorr signature found in the transaction witness data,
 *          or undefined if no valid signature exists
 */
const extractFirstSchnorrSignatureFromTransaction = (
  singedTransaction: Transaction,
): Buffer | undefined => {
  // Loop through each input to extract the witness signature
  for (const input of singedTransaction.ins) {
    if (input.witness && input.witness.length > 0) {
      const schnorrSignature = input.witness[0];

      // Check that it's a 64-byte Schnorr signature
      if (schnorrSignature.length === 64) {
        return schnorrSignature; // Return the first valid signature found
      }
    }
  }
  return undefined;
};

/**
 * Strips all signatures from a transaction by clearing both the script and 
 * witness data. This is due to the fact that we only need the raw unsigned 
 * transaction structure. The signatures are sent in a separate protobuf field 
 * when creating the delegation message in the Babylon.
 * @param tx - The transaction to strip signatures from
 * @returns A copy of the transaction with all signatures removed
 */
const clearTxSignatures = (tx: Transaction): Transaction => {
  tx.ins.forEach((input) => {
    input.script = Buffer.alloc(0);
    input.witness = [];
  });
  return tx;
};

/**
 * Derives the merkle proof from the list of hex strings. Note the
 * sibling hashes are reversed from hex before concatenation.
 * @param merkle - The merkle proof hex strings.
 * @returns The merkle proof in hex string format.
 */
const deriveMerkleProof = (merkle: string[]) => {
  const proofHex = merkle.reduce((acc: string, m: string) => {
    return acc + Buffer.from(m, "hex").reverse().toString("hex");
  }, "");
  return proofHex;
};
