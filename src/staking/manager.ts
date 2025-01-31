import { networks, Psbt, Transaction } from "bitcoinjs-lib";
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
import { BBN_REGISTRY_TYPE_URLS } from "../constants/bbnRegistry";
import { createCovenantWitness } from "./transactions";
import { getBbnParamByBtcHeight, getBbnParamByVersion } from "../utils/staking/param";
import { reverseBuffer, uint8ArrayToHex } from "../utils";

export interface BtcProvider {
  // Sign a PSBT
  signPsbt(psbtHex: string): Promise<string>;
  // Sign a message using the ECDSA type
  signMessage: (message: string, type: "ecdsa") => Promise<string>;
  // Get the staker info
  getStakerInfo(): Promise<StakerInfo>;
  // Get the available UTXOs for staking
  getUTXOs(): Promise<UTXO[]>;
}

export interface BbnProvider {
  // Get the Babylon BTC tip height. Note the there might be a delay between
  // the BTC tip height and the Babylon BTC tip height. You should not use the
  // BTC tip height to determine the BBN param.
  getBabylonBtcTipHeight(): Promise<number>;
  // Get the Babylon Chain address
  getBbnAddress(): Promise<string>;
  // Sign a babylon transaction.
  signTransaction: <T extends object>(msg: {
    typeUrl: string;
    value: T;
  }) => Promise<Uint8Array>
}

interface StakingInputs {
  finalityProviderPkNoCoordHex: string;
  stakingAmountSat: number;
  stakingTimelock: number;
}

interface InclusionProof {
  pos: number;
  merkle: string[];
  blockHash: string;
}

export class BabylonBtcStakingManager {
  private stakingParams: VersionedStakingParams[];
  private btcProvider: BtcProvider;
  private network: networks.Network;
  private bbnProvider: BbnProvider;

  constructor(
    network: networks.Network,
    stakingParams: VersionedStakingParams[],
    btcProvider: BtcProvider,
    bbnProvider: BbnProvider,
  ) {
    this.network = network;
    this.btcProvider = btcProvider;
    this.bbnProvider = bbnProvider;

    if (stakingParams.length === 0) {
      throw new Error("No staking parameters provided");
    }
    this.stakingParams = stakingParams;
  }

  /**
   * Creates an signed EOI transaction that is ready to be sent to the BBN chain.
   * @param stakingInput - The staking inputs.
   * @param feeRate - The fee rate in satoshis per byte.
   * @returns The signed babylon transaction in base64 format.
   */
  async createEoiDelegationBbnTransaction(
    stakingInput: StakingInputs,
    feeRate: number,
  ): Promise<{
    signedBbnTx: Uint8Array;
    stakingTx: Transaction;
  }> {
    const tipHeight = await this.bbnProvider.getBabylonBtcTipHeight();
    if (tipHeight === 0) {
      throw new Error("Babylon BTC tip height cannot be 0");
    }
    const inputUTXOs = await this.btcProvider.getUTXOs();
    if (inputUTXOs.length === 0) {
      throw new Error("No input UTXOs provided");
    }
    const bech32Address = await this.bbnProvider.getBbnAddress();
    if (!bech32Address) {
      throw new Error("Babylon address cannot be empty");
    }

    // Get the param based on the tip height
    // EOI should always be created based on the BTC tip height from BBN chain
    const p = getBbnParamByBtcHeight(tipHeight, this.stakingParams);
    
    const stakerInfo = await this.btcProvider.getStakerInfo();

    const staking = new Staking(
      this.network,
      stakerInfo,
      p,
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
        p
      );

      return {
        signedBbnTx: await this.bbnProvider.signTransaction(msg),
        stakingTx: transaction,
      };
  }

  /**
   * Creates a signed delegation transaction that is ready to be sent to the 
   * BBN chain. This is used when a staking transaction is already created and
   * included in a BTC block and we want to register it on the BBN chain.
   * @param stakingTx - The staking transaction.
   * @param stakingTxHeight - The height of the staking transaction.
   * @param stakingInput - The staking inputs.
   * @returns The signed babylon transaction in base64 format.
   */
  async registerDelegationBbnTransaction(
    stakingTx: Transaction,
    stakingTxHeight: number,
    stakingInput: StakingInputs,
    inclusionProof: InclusionProof,
  ): Promise<{
    signedBbnTx: Uint8Array;
  }> {
    // Get the staking params at the time of the staking transaction
    const p = getBbnParamByBtcHeight(stakingTxHeight, this.stakingParams);
    if (!p)
      throw new Error(
        `Unable to find staking params for height ${stakingTxHeight}`,
      );
    
    const stakerBtcInfo = await this.btcProvider.getStakerInfo();
    if (!stakerBtcInfo) {
      throw new Error("Staker info not found while registering delegation");
    }

    const bech32Address = await this.bbnProvider.getBbnAddress();
    if (!bech32Address) {
      throw new Error("Babylon address cannot be empty");
    }

    const stakingInstance = new Staking(
      this.network,
      stakerBtcInfo,
      p,
      stakingInput.finalityProviderPkNoCoordHex,
      stakingInput.stakingTimelock,
    );

    // Create delegation message
    const delegationMsg = await this.createBtcDelegationMsg(
      stakingInstance,
      stakingInput,
      stakingTx,
      bech32Address,
      stakerBtcInfo,
      p,
      this.getInclusionProof(inclusionProof),
    );

    return {
      signedBbnTx: await this.bbnProvider.signTransaction(delegationMsg),
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
    const tipHeight = await this.bbnProvider.getBabylonBtcTipHeight();
    if (tipHeight === 0) {
      throw new Error("Babylon BTC tip height cannot be 0");
    }
    // Get the param based on the tip height
    const p = getBbnParamByBtcHeight(tipHeight, this.stakingParams);
    
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
      p,
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
    const p = getBbnParamByVersion(stakingParamVersion, this.stakingParams);
    if (!p) {
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
      p,
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
  ) {
    // Get the staking params at the time of the staking transaction
    const p = getBbnParamByVersion(stakingParamVersion, this.stakingParams);
    if (!p) {
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
      p,
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
    const covenantBuffers = p.covenantNoCoordPks.map((covenant) =>
      Buffer.from(covenant, "hex"),
    );
    const witness = createCovenantWitness(
      signedUnbondingTx.ins[0].witness,
      covenantBuffers,
      covenantUnbondingSignatures,
      p.covenantQuorum,
    );
    // Overwrite the witness to include the covenant unbonding signatures
    signedUnbondingTx.ins[0].witness = witness;

    return signedUnbondingTx;
  }

  /**
   * Creates a signed withdrawal transaction on the unbonding path that is 
   * ready to be sent to the BTC network.
   * @param stakingInput - The staking inputs.
   * @param stakingParamVersion - The param version that was used to create the EOI
   * @param earlyUnbondingTx - The early unbonding transaction.
   * @param feeRate - The fee rate in satoshis per byte.
   * @returns The signed withdrawal transaction.
   */
  async createWithdrawEarlyUnbondedBtcTransaction(
    stakingInput: StakingInputs,
    stakingParamVersion: number,
    earlyUnbondingTx: Transaction,
    feeRate: number,
  ): Promise<Transaction> {
    const p = getBbnParamByVersion(stakingParamVersion, this.stakingParams);
    if (!p) {
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
      p,
      stakingInput.finalityProviderPkNoCoordHex,
      stakingInput.stakingTimelock,
    );

    
    const { psbt: unbondingPsbt } =
    staking.createWithdrawEarlyUnbondedTransaction(
      earlyUnbondingTx,
      feeRate,
    );

    const signedWithdrawalPsbtHex = await this.btcProvider.signPsbt(
      unbondingPsbt.toHex()
    );
    return Psbt.fromHex(signedWithdrawalPsbtHex).extractTransaction();
  }

  /**
   * Creates a signed withdrawal transaction on the staking expired path that is 
   * ready to be sent to the BTC network.
   * @param stakingInput - The staking inputs.
   * @param stakingParamVersion - The param version that was used to create the EOI
   * @param stakingTx - The staking transaction.
   * @param feeRate - The fee rate in satoshis per byte.
   * @returns The signed withdrawal transaction.
   */
  async createWithdrawStakingExpiredBtcTransaction(
    stakingInput: StakingInputs,
    stakingParamVersion: number,
    stakingTx: Transaction,
    feeRate: number,
  ): Promise<Transaction> {
    const p = getBbnParamByVersion(stakingParamVersion, this.stakingParams);
    if (!p) {
      throw new Error(`Unable to find staking params for version ${stakingParamVersion}`);
    }

    const stakerInfo = await this.btcProvider.getStakerInfo();
    if (!stakerInfo) {
      throw new Error("Staker info not found while creating signed unbonding transaction");
    }

    const staking = new Staking(
      this.network,
      stakerInfo,
      p,
      stakingInput.finalityProviderPkNoCoordHex,
      stakingInput.stakingTimelock,
    );

    const { psbt } = staking.createWithdrawStakingExpiredTransaction(
      stakingTx,
      feeRate,
    );

    const signedWithdrawalPsbtHex = await this.btcProvider.signPsbt(
      psbt.toHex()
    );
    return Psbt.fromHex(signedWithdrawalPsbtHex).extractTransaction();
  }

  /**
   * Creates a signed withdrawal transaction on the slashing path that is 
   * ready to be sent to the BTC network.
   * @param stakingInput - The staking inputs.
   * @param stakingParamVersion - The param version that was used to create the EOI
   * @param slashingTx - The slashing transaction.
   * @param feeRate - The fee rate in satoshis per byte.
   * @returns The signed withdrawal transaction.
   */
  async createWithdrawSlashingBtcTransaction(
    stakingInput: StakingInputs,
    stakingParamVersion: number,
    slashingTx: Transaction,
    feeRate: number,
  ): Promise<Transaction> {
    const p = getBbnParamByVersion(stakingParamVersion, this.stakingParams);
    if (!p) {
      throw new Error(`Unable to find staking params for version ${stakingParamVersion}`);
    }

    const stakerInfo = await this.btcProvider.getStakerInfo();
    if (!stakerInfo) {
      throw new Error("Staker info not found while creating withdraw slashing transaction");
    }

    const staking = new Staking(
      this.network,
      stakerInfo,
      p,
      stakingInput.finalityProviderPkNoCoordHex,
      stakingInput.stakingTimelock,
    );

    const { psbt } = staking.createWithdrawSlashingTransaction(
      slashingTx,
      feeRate,
    );

    const signedSlashingPsbtHex = await this.btcProvider.signPsbt(
      psbt.toHex()
    );
    return Psbt.fromHex(signedSlashingPsbtHex).extractTransaction();
  }

  private async createBtcDelegationMsg(
    stakingInstance: Staking,
    stakingInput: StakingInputs,
    stakingTx: Transaction,
    bech32Address: string,
    stakerInfo: StakerInfo,
    param: StakingParams,
    inclusionProof?: btcstaking.InclusionProof,
  ) {
    const { transaction: unbondingTx } =
      stakingInstance.createUnbondingTransaction(stakingTx);

    // Create slashing transactions and extract signatures
    const { psbt: slashingPsbt } =
      stakingInstance.createStakingOutputSlashingTransaction(stakingTx);
    const signedSlashingPsbtHex = await this.btcProvider.signPsbt(
      slashingPsbt.toHex(),
    );
    const signedSlashingTx = Psbt.fromHex(
      signedSlashingPsbtHex,
    ).extractTransaction();
    const slashingSig = extractSchnorrSignaturesFromTransaction(signedSlashingTx);
    if (!slashingSig) {
      throw new Error("No signature found in the staking output slashing PSBT");
    }

    const { psbt: unbondingSlashingPsbt } =
      stakingInstance.createUnbondingOutputSlashingTransaction(unbondingTx);
    const signedUnbondingSlashingPsbtHex = await this.btcProvider.signPsbt(
      unbondingSlashingPsbt.toHex(),
    );
    const signedUnbondingSlashingTx = Psbt.fromHex(
      signedUnbondingSlashingPsbtHex,
    ).extractTransaction();
    const unbondingSignatures = extractSchnorrSignaturesFromTransaction(
      signedUnbondingSlashingTx,
    );
    if (!unbondingSignatures) {
      throw new Error("No signature found in the unbonding output slashing PSBT");
    }

    // Create Proof of Possession
    const bech32AddressHex = uint8ArrayToHex(fromBech32(bech32Address).data);
    const signedBbnAddress = await this.btcProvider.signMessage(
      bech32AddressHex,
      "ecdsa",
    );
    const ecdsaSig = Uint8Array.from(Buffer.from(signedBbnAddress, "base64"));
    const proofOfPossession: ProofOfPossessionBTC = {
      btcSigType: BTCSigType.ECDSA,
      btcSig: ecdsaSig,
    };

    // Prepare and send protobuf message
    const msg: btcstakingtx.MsgCreateBTCDelegation =
      btcstakingtx.MsgCreateBTCDelegation.fromPartial({
        stakerAddr: bech32Address,
        pop: proofOfPossession,
        btcPk: Uint8Array.from(
          Buffer.from(stakerInfo.publicKeyNoCoordHex, "hex"),
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
      typeUrl: BBN_REGISTRY_TYPE_URLS.MsgCreateBTCDelegation,
      value: msg,
    };
  };

  private getInclusionProof(
    inclusionProof: InclusionProof,
  ): btcstaking.InclusionProof {
    const {
      pos,
      merkle,
      blockHash
    } = inclusionProof;
    const proofHex = deriveMerkleProof(merkle);
  
    const hash = reverseBuffer(Uint8Array.from(Buffer.from(blockHash, "hex")));
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
 * @param singedTransaction - The signed transaction.
 * @returns The first valid Schnorr signature or undefined if no valid signature is found.
 */
export const extractSchnorrSignaturesFromTransaction = (
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
 * Clears the signatures from a transaction.
 * @param tx - The transaction to clear the signatures from.
 * @returns The transaction with the signatures cleared.
 */
export const clearTxSignatures = (tx: Transaction): Transaction => {
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
export const deriveMerkleProof = (merkle: string[]) => {
  const proofHex = merkle.reduce((acc: string, m: string) => {
    return acc + Buffer.from(m, "hex").reverse().toString("hex");
  }, "");
  return proofHex;
};
