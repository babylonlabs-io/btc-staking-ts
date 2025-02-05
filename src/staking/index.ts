import { Psbt, Transaction, networks } from "bitcoinjs-lib";
import { fromBech32 } from "@cosmjs/encoding";
import {
  btcstaking,
  btcstakingpop,
  btcstakingtx
} from "@babylonlabs-io/babylon-proto-ts";

import { StakingParams, VersionedStakingParams } from "../types/params";
import { BABYLON_REGISTRY_TYPE_URLS } from "../constants/registry";
import { uint8ArrayToHex } from "../utils";
import { 
  isValidBitcoinAddress,
  isValidNoCoordPublicKey
} from "../utils/btc";
import {
  deriveSlashingOutput,
  deriveStakingOutputInfo,
  findMatchingTxOutputIndex,
  toBuffers,
  validateStakingTimelock,
  validateParams,
  validateStakingTxInputData
} from "../utils/staking";
import { StakingError, StakingErrorCode } from "../error";
import {
  createCovenantWitness,
  slashEarlyUnbondedTransaction,
  stakingTransaction,
  slashTimelockUnbondedTransaction,
  unbondingTransaction,
  withdrawEarlyUnbondedTransaction,
  withdrawSlashingTransaction,
  withdrawTimelockUnbondedTransaction
} from "./transactions";
import { unbondingPsbt } from "./psbt";
import { getBabylonParamByBtcHeight } from "../utils/staking/param";
import { StakingScriptData, StakingScripts } from "./stakingScript";
import { UTXO } from "../types";

interface StakingInputs {
  finalityProviderPkNoCoordHex: string;
  stakingAmountSat: number;
  stakingTimelock: number;
}

interface StakerBtcInfo {
  address: string;
  publicKeyNoCoordHex: string;
}

export interface TransactionResultHex {
  transactionHex: string;
  fee: number;
}

export interface PsbtResultHex {
  psbtHex: string;
  fee: number;
}

export interface TransactionResults {
  stakingResult: TransactionResultHex;
  unbondingResult: TransactionResultHex;
  slashingResult: PsbtResultHex;
  unbondingSlashingResult: PsbtResultHex;
}

/**
 * Base class with common functionality for staking registration builders.
 * 
 * @param network - The network to use for the staking registration.
 * @param stakingParams - The staking parameters to use for the staking registration.
 */
export abstract class StakingBuilder {
  protected network: networks.Network;
  protected params: StakingParams;

  protected stakerBtcInfo?: StakerBtcInfo;
  protected stakingInput?: StakingInputs;
  protected babylonAddress?: string;
  protected btcHeightForBabylonParams?: number;
  

  constructor(
    network: networks.Network,
    versionedStakingParams: VersionedStakingParams[],
    btcHeightForBabylonParams: number,
  ) {
    this.network = network;
    if (versionedStakingParams.length === 0) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        "No staking parameters provided",
      );
    }
    // Validate all versioned staking parameters
    versionedStakingParams.forEach((params) => {
      validateParams(params);
    });

    this.params = getBabylonParamByBtcHeight(
      btcHeightForBabylonParams, versionedStakingParams
    );
  }

  /**
   * Sets the staker BTC info.
   * 
   * @param stakerBtcInfo - The staker BTC info.
   * @returns The builder instance.
   */
  withStakerBtcInfo(stakerBtcInfo: StakerBtcInfo): this {
    if (!isValidBitcoinAddress(stakerBtcInfo.address, this.network)) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        "Invalid staker BTC address",
      );
    } else if (!isValidNoCoordPublicKey(stakerBtcInfo.publicKeyNoCoordHex)) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        "Invalid staker BTC no-coord public key",
      );
    }
    this.stakerBtcInfo = stakerBtcInfo;
    return this;
  }

  /**
   * Sets the staking input.
   * 
   * @param input - The staking input.
   * @returns The builder instance.
   */
  withStakingInput(input: StakingInputs): this {
    if (input.stakingAmountSat <= 0) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        "Staking amount must be greater than 0",
      );
    } else if (!isValidNoCoordPublicKey(input.finalityProviderPkNoCoordHex)) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        "Invalid finality provider no-coord public key",
      );
    }
    validateStakingTimelock(input.stakingTimelock, this.params);
    this.stakingInput = input;
    return this;
  }

  /**
   * Sets the Babylon address.
   * 
   * @param bech32Address - The Babylon address. Start with "bbn"
   * @returns The builder instance.
   */
  withBabylonAddress(bech32Address: string): this {
    if (!isValidBabylonAddress(bech32Address)) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        "Invalid Babylon address",
      );
    }
    this.babylonAddress = bech32Address;
    return this;
  }

  /**
   * Builds the staking scripts based on the staking parameters, staker BTC info,
   * and staking input.
   * 
   * @returns The staking scripts.
   */
  buildScripts(): StakingScripts {
    const { covenantQuorum, covenantNoCoordPks, unbondingTime } = this.params;
    const { publicKeyNoCoordHex } = this.stakerBtcInfo!;
    const { finalityProviderPkNoCoordHex, stakingTimelock } = this.stakingInput!;
    // Create staking script data
    let stakingScriptData;
    try {
      stakingScriptData = new StakingScriptData(
        Buffer.from(publicKeyNoCoordHex, "hex"),
        [Buffer.from(finalityProviderPkNoCoordHex, "hex")],
        toBuffers(covenantNoCoordPks),
        covenantQuorum,
        stakingTimelock,
        unbondingTime
      );
    } catch (error: unknown) {
      throw StakingError.fromUnknown(
        error, StakingErrorCode.SCRIPT_FAILURE, 
        "Cannot build staking script data",
      );
    }

    // Build scripts
    let scripts;
    try {
      scripts = stakingScriptData.buildScripts();
    } catch (error: unknown) {
      throw StakingError.fromUnknown(
        error, StakingErrorCode.SCRIPT_FAILURE,
        "Cannot build staking scripts",
      );
    }
    return scripts;
  }

  /**
   * Creates a proof of possession for the staker.
   * 
   * @param signMessage - The sign message function.
   * @returns The proof of possession.
   */
  public async createProofOfPossession(
    signMessage: (message: string, type: "ecdsa") => Promise<string>,
  ): Promise<btcstakingpop.ProofOfPossessionBTC> {
    if (!signMessage) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        "Sign message function not found",
      );
    }
    if (!this.babylonAddress) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        "Babylon address required",
      );
    }
    // Create Proof of Possession
    const bech32AddressHex = uint8ArrayToHex(fromBech32(this.babylonAddress).data);
    const signedBabylonAddress = await signMessage(
      bech32AddressHex,
      "ecdsa",
    );
    const ecdsaSig = Uint8Array.from(Buffer.from(signedBabylonAddress, "base64"));
    return {
      btcSigType: btcstakingpop.BTCSigType.ECDSA,
      btcSig: ecdsaSig,
    };
  }

  /**
   * Validates the common fields to ensure the builder is properly configured.
   */
  protected validateCommonFields() {
    if (!this.stakerBtcInfo) throw new StakingError(
      StakingErrorCode.INVALID_INPUT,
      "Staker BTC info required",
    );
    if (!this.stakingInput) throw new StakingError(
      StakingErrorCode.INVALID_INPUT,
      "Staking input required",
    );
   if (!this.btcHeightForBabylonParams) throw new StakingError(
      StakingErrorCode.INVALID_INPUT,
      "BTC height for Babylon params required",
    );
  }

  /**
   * Builds the transactions from an existing staking transaction.
   * The transactions are unbonding, slashing psbt, and unbonding slashing psbt.
   * 
   * @param stakingInstance - The staking instance.
   * @param stakingTx - The staking transaction.
   * @returns An object containing the unbonding transaction, slashing PSBT, and 
   * unbonding slashing PSBT as well as their fees. 
   * The transactions are hex encoded.
   */
  protected buildTransactionsFromExisting(
    stakingTx: Transaction,
  ): Omit<TransactionResults, "stakingResult"> {
    const { transaction: unbondingTx, fee: unbondingFee } = 
      this.createUnbondingTransaction(stakingTx);

    const { psbt: slashingPsbt, fee: slashingFee } =
      this.createStakingOutputSlashingPsbt(stakingTx);
    
    const { psbt: unbondingSlashingPsbt, fee: unbondingSlashingFee } =
      this.createUnbondingOutputSlashingPsbt(unbondingTx);

    return {
      unbondingResult: {
        transactionHex: unbondingTx.toHex(),
        fee: unbondingFee,
      },
      slashingResult: {
        psbtHex: slashingPsbt.toHex(),
        fee: slashingFee,
      },
      unbondingSlashingResult: {
        psbtHex: unbondingSlashingPsbt.toHex(),
        fee: unbondingSlashingFee,
      },
    };
  }

  /**
   * Creates a delegation message.
   * 
   * @param unsignedStakingTxHex - The unsigned staking transaction hex.
   * @param unsignedUnbondingTxHex - The unsigned unbonding transaction hex.
   * @param signedSlashingTxHex - The signed slashing transaction hex.
   * @param signedUnbondingSlashingTxHex - The signed unbonding slashing transaction hex.
   * @param proofOfPossession - The proof of possession.
   * @param inclusionProof - The inclusion proof. This is optional.
   * @returns The delegation message.
   */
  protected createDelegationMessage(
    unsignedStakingTxHex: string,
    unsignedUnbondingTxHex: string,
    signedSlashingTxHex: string,
    signedUnbondingSlashingTxHex: string,
    proofOfPossession: btcstakingpop.ProofOfPossessionBTC,
    inclusionProof?: btcstaking.InclusionProof,
  ): {
    typeUrl: BABYLON_REGISTRY_TYPE_URLS.MsgCreateBTCDelegation;
    value: btcstakingtx.MsgCreateBTCDelegation;
  } {
    if (!this.babylonAddress) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        "Babylon address required",
      );
    }
    const unsignedStakingTx = Transaction.fromHex(unsignedStakingTxHex);
    const signedSlashingTx = Transaction.fromHex(signedSlashingTxHex);
    const unsignedUnbondingTx = Transaction.fromHex(unsignedUnbondingTxHex);
    const signedUnbondingSlashingTx = Transaction.fromHex(signedUnbondingSlashingTxHex);
  
    // Extract signatures from signed transactions
    const slashingSig = extractFirstSchnorrSignatureFromTransaction(
      signedSlashingTx
    );
    if (!slashingSig) {
      throw new Error(
        "No signature found in the staking output slashing transaction"
      );
    }

    const unbondingSlashingSig = extractFirstSchnorrSignatureFromTransaction(
      signedUnbondingSlashingTx
    );
    if (!unbondingSlashingSig) {
      throw new Error(
        "No signature found in the unbonding output slashing transaction"
      );
    }
    
    // Create the delegation message
    const msg: btcstakingtx.MsgCreateBTCDelegation = 
      btcstakingtx.MsgCreateBTCDelegation.fromPartial({
        stakerAddr: this.babylonAddress!,
        pop: proofOfPossession,
        btcPk: Uint8Array.from(
          Buffer.from(this.stakerBtcInfo!.publicKeyNoCoordHex, "hex")
        ),
        fpBtcPkList: [
          Uint8Array.from(
            Buffer.from(this.stakingInput!.finalityProviderPkNoCoordHex, "hex")
          ),
        ],
        stakingTime: this.stakingInput!.stakingTimelock,
        stakingValue: this.stakingInput!.stakingAmountSat,
        stakingTx: Uint8Array.from(unsignedStakingTx.toBuffer()),
        slashingTx: Uint8Array.from(
          Buffer.from(clearTxSignatures(signedSlashingTx).toHex(), "hex")
        ),
        delegatorSlashingSig: Uint8Array.from(slashingSig),
        unbondingTime: this.params.unbondingTime,
        unbondingTx: Uint8Array.from(unsignedUnbondingTx.toBuffer()),
        unbondingValue: this.stakingInput!.stakingAmountSat - this.params.unbondingFeeSat,
        unbondingSlashingTx: Uint8Array.from(
          Buffer.from(
            clearTxSignatures(signedUnbondingSlashingTx).toHex(),
            "hex"
          )
        ),
        delegatorUnbondingSlashingSig: Uint8Array.from(unbondingSlashingSig),
        stakingTxInclusionProof: inclusionProof 
          ? inclusionProof
          : undefined,
      });

    return {
      typeUrl: BABYLON_REGISTRY_TYPE_URLS.MsgCreateBTCDelegation,
      value: msg,
    };
  }

  /**
   * Create an unbonding psbt hex base on existing unbonding and staking transactions.
   * 
   * @param unbondingTxHex - The unbonding transaction hex.
   * @param stakingTxHex - The staking transaction hex.
   * @returns The unbonding psbt hex.
   */
  toUnbondingPsbtHex(
    unbondingTxHex: string,
    stakingTxHex: string,
  ): string {
    const scripts = this.buildScripts();

    return unbondingPsbt(
      scripts,
      Transaction.fromHex(unbondingTxHex),
      Transaction.fromHex(stakingTxHex),
      this.network,
    ).toHex();
  }

  /**
   * Attach covenant signatures to the unbonding transaction.
   * 
   * @param signedUnbondingPsbtHex - The signed unbonding psbt hex.
   * @param covenantUnbondingSignatures - The covenant unbonding signatures.
   * This value can be obtained from Babylon API or from the Babylon chain.
   * @returns The unbonding transaction hex with the covenant signatures attached.
   */
  attachCovenantSignaturesToUnbondingTx(
    signedUnbondingPsbtHex: string,
    covenantUnbondingSignatures: {
      btcPkHex: string;
      sigHex: string;
    }[],
  ): string {
    const signedUnbondingTx = Psbt
      .fromHex(signedUnbondingPsbtHex).extractTransaction();

    // Add covenant unbonding signatures
    // Convert the params of covenants to buffer
    const covenantBuffers = this.params.covenantNoCoordPks.map((covenant) =>
      Buffer.from(covenant, "hex"),
    );
    const witness = createCovenantWitness(
      // UnbondingTx has only one input
      signedUnbondingTx.ins[0].witness,
      covenantBuffers,
      covenantUnbondingSignatures,
      this.params.covenantQuorum,
    );
    // Overwrite the witness to include the covenant unbonding signatures
    signedUnbondingTx.ins[0].witness = witness;
    return signedUnbondingTx.toHex();
  }

  /**
   * Create a withdraw psbt on the unbonding output expiry path that is ready to
   * be signed and broadcasted to the network.
   * 
   * @param earlyUnbondingTxHex - The early unbonding transaction hex.
   * @param feeRate - The fee rate for the transaction in satoshis per byte.
   * @returns The withdraw early unbonded psbt hex.
   */
  createWithdrawEarlyUnbondedPsbt(
    earlyUnbondingTxHex: string,
    feeRate: number,
  ): PsbtResultHex {
    const scripts = this.buildScripts();

     // Create the withdraw early unbonded transaction
     try {
      const { psbt, fee } = withdrawEarlyUnbondedTransaction(
        scripts,
        Transaction.fromHex(earlyUnbondingTxHex),
        this.stakerBtcInfo!.address,
        this.network,
        feeRate,
      );  
      return {
        psbtHex: psbt.toHex(),
        fee,
      };
    } catch (error) {
      throw StakingError.fromUnknown(
        error, StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build unsigned withdraw early unbonded transaction",
      );
    }
  }

  /**
   * Create a withdraw psbt on the staking output expiry path that is ready to
   * be signed and broadcasted to the network.
   * 
   * @param stakingTxHex - The staking transaction hex.
   * @param feeRate - The fee rate for the transaction in satoshis per byte.
   * @returns The withdraw staking expired psbt hex.
   */
  createWithdrawStakingExpiredPsbt(
    stakingTxHex: string,
    feeRate: number,
  ): PsbtResultHex {
    // Build scripts
    const scripts = this.buildScripts();
    const { outputAddress } = deriveStakingOutputInfo(scripts, this.network);
    // Reconstruct the stakingOutputIndex
    const stakingTx = Transaction.fromHex(stakingTxHex);
    const stakingOutputIndex = findMatchingTxOutputIndex(
      stakingTx,
      outputAddress,
      this.network,
    )

    // Create the timelock unbonded transaction
    try {
      const { psbt, fee } = withdrawTimelockUnbondedTransaction(
        scripts,
        stakingTx,
        this.stakerBtcInfo!.address,
        this.network,
        feeRate,
        stakingOutputIndex,
      );  
      return {
        psbtHex: psbt.toHex(),
        fee,
      };
    } catch (error) {
      throw StakingError.fromUnknown(
        error, StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build unsigned timelock unbonded transaction",
      );
    }
  }

  /**
   * Create a withdraw slashing psbt that spends a expired change output of a 
   * slashing transaction. This psbt is ready to be signed and broadcasted to the
   * network.
   * 
   * @param slashingTxHex - The slashing transaction hex.
   * @param feeRate - The fee rate for the transaction in satoshis per byte.
   * @returns An object containing the unsigned psbt and fee
   */
  public createWithdrawSlashingPsbt(
    slashingTxHex: string,
    feeRate: number,
  ): PsbtResultHex {
    // Build scripts
    const scripts = this.buildScripts();
    const slashingOutputInfo = deriveSlashingOutput(scripts, this.network);

    // Reconstruct the slashing transaction
    const slashingTx = Transaction.fromHex(slashingTxHex);
    // Reconstruct and validate the slashingOutputIndex
    const slashingOutputIndex = findMatchingTxOutputIndex(
      slashingTx,
      slashingOutputInfo.outputAddress,
      this.network,
    )

    // Create the withdraw slashed transaction
    try {
      const { psbt, fee } = withdrawSlashingTransaction(
        scripts,
        slashingTx,
        this.stakerBtcInfo!.address,
        this.network,
        feeRate,
        slashingOutputIndex,
      );  
      return {
        psbtHex: psbt.toHex(),
        fee,
      };
    } catch (error) {
      throw StakingError.fromUnknown(
        error, StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build withdraw slashing transaction",
      );
    }
  }

  /**
   * Create a staking transaction for staking.
   * 
   * @param stakingTimelock - The staking timelock.
   * @param stakingAmountSat - The amount to stake in satoshis.
   * @param inputUTXOs - The UTXOs to use as inputs for the staking 
   * transaction.
   * @param feeRate - The fee rate for the transaction in satoshis per byte.
   * @returns The staking transaction and its fee
   */
  protected createStakingTransaction(
    inputUTXOs: UTXO[],
    feeRate: number,
  ) {
    const { stakingAmountSat, stakingTimelock } = this.stakingInput!;
    validateStakingTxInputData(
      stakingAmountSat,
      stakingTimelock,
      this.params,
      inputUTXOs,
      feeRate,
    );
    const scripts = this.buildScripts();

    try {
      const { transaction, fee } = stakingTransaction(
        scripts,
        stakingAmountSat,
        this.stakerBtcInfo!.address,
        inputUTXOs,
        this.network,
        feeRate,
      );
      return {
        transaction,
        fee,
      };
    } catch (error: unknown) {
      throw StakingError.fromUnknown(
        error, StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build unsigned staking transaction",
      );
    }
  };

  /**
   * Create an unbonding transaction for staking.
   * 
   * @param stakingTx - The staking transaction.
   * @param params - The staking parameters.
   * @returns The unbonding transaction and its fee
   */
  protected createUnbondingTransaction(
    stakingTx: Transaction,
  ) {
    // Build scripts
    const scripts = this.buildScripts();
    const { outputAddress } = deriveStakingOutputInfo(scripts, this.network);
    // Reconstruct the stakingOutputIndex
    const stakingOutputIndex = findMatchingTxOutputIndex(
      stakingTx,
      outputAddress,
      this.network,
    )
    // Create the unbonding transaction
    try {
      const { transaction, fee } = unbondingTransaction(
        scripts,
        stakingTx,
        this.params.unbondingFeeSat,
        this.network,
        stakingOutputIndex,
      );
      return {
        transaction,
        fee,
      };
    } catch (error) {
      throw StakingError.fromUnknown(
        error, StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build the unbonding transaction",
      );
    }
  }

  /**
   * Create a slashing psbt spending from the staking output.
   * 
   * @param stakingTx - The staking transaction to slash.
   * @param params - The staking parameters.
   * @returns An object containing the unsigned slashing psbt and its fee
   */
  protected createStakingOutputSlashingPsbt(
    stakingTx: Transaction,
  ) {
    if (!this.params.slashing) {
      throw new StakingError(
        StakingErrorCode.INVALID_PARAMS,
        "Slashing parameters are missing",
      );
    }
    
    const {
      slashingPkScriptHex,
      slashingRate,
      minSlashingTxFeeSat
    } = this.params.slashing;

    // Build scripts
    const scripts = this.buildScripts();

    // create the slash timelock unbonded transaction
    try {
      const { psbt } = slashTimelockUnbondedTransaction(
        scripts,
        stakingTx,
        slashingPkScriptHex,
        slashingRate,
        minSlashingTxFeeSat,
        this.network,
      );
      return {
        psbt,
        fee: minSlashingTxFeeSat,
      };
    } catch (error) {
      throw StakingError.fromUnknown(
        error, StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build the slash timelock unbonded transaction",
      );
    }
  }

  /**
   * Create a slashing psbt for an unbonding output.
   * 
   * @param unbondingTx - The unbonding transaction to slash.
   * @param params - The staking parameters.
   * @returns An object containing the unsigned slashing psbt and its fee
   */
  protected createUnbondingOutputSlashingPsbt(
    unbondingTx: Transaction,
  ) {
    if (!this.params.slashing) {
      throw new StakingError(
        StakingErrorCode.INVALID_PARAMS,
        "Slashing parameters are missing",
      );
    }
    // Build scripts
    const scripts = this.buildScripts();

    const {
      slashingPkScriptHex,
      slashingRate,
      minSlashingTxFeeSat
    } = this.params.slashing;

    // create the slash timelock unbonded transaction
    try {
      const { psbt } = slashEarlyUnbondedTransaction(
        scripts,
        unbondingTx,
        slashingPkScriptHex,
        slashingRate,
        minSlashingTxFeeSat,
        this.network,
      );
      return {
        psbt,
        fee: minSlashingTxFeeSat,
      };
    } catch (error) {
      throw StakingError.fromUnknown(
        error, StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build the slash early unbonded transaction",
      );
    }
  }
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
 * Validates a Babylon address. Babylon addresses are encoded in Bech32 format 
 * and have a prefix of "bbn".
 * @param address - The address to validate.
 * @returns True if the address is valid, false otherwise.
 */
const isValidBabylonAddress = (address: string): boolean => {
  try {
    const { prefix } = fromBech32(address);
    return prefix === "bbn";
  } catch (error) {
    return false;
  }
};
