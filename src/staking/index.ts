import { networks, Psbt, Transaction } from "bitcoinjs-lib";
import { StakingError, StakingErrorCode } from "../error";
import { StakingParams } from "../types/params";
import { PsbtResult, TransactionResult } from "../types/transaction";
import { UTXO } from "../types/UTXO";
import {
  isTaproot,
  isValidBitcoinAddress,
  isValidNoCoordPublicKey,
} from "../utils/btc";
import {
  deriveSlashingOutput,
  deriveStakingOutputInfo,
  findMatchingTxOutputIndex,
  toBuffers,
  validateParams,
  validateStakingTimelock,
  validateStakingTxInputData,
} from "../utils/staking";
import { stakingPsbt, unbondingPsbt } from "./psbt";
import { StakingScriptData, StakingScripts } from "./stakingScript";
import {
  expandStakingTransaction,
  slashEarlyUnbondedTransaction,
  slashTimelockUnbondedTransaction,
  stakingTransaction,
  unbondingTransaction,
  withdrawEarlyUnbondedTransaction,
  withdrawSlashingTransaction,
  withdrawTimelockUnbondedTransaction,
} from "./transactions";
export * from "./stakingScript";

export interface StakerInfo {
  address: string;
  publicKeyNoCoordHex: string;
}

export class Staking {
  network: networks.Network;
  stakerInfo: StakerInfo;
  params: StakingParams;
  finalityProviderPksNoCoordHex: string[];
  stakingTimelock: number;

  constructor(
    network: networks.Network,
    stakerInfo: StakerInfo,
    params: StakingParams,
    finalityProviderPksNoCoordHex: string[],
    stakingTimelock: number,
  ) {
    // Perform validations
    if (!isValidBitcoinAddress(stakerInfo.address, network)) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        "Invalid staker bitcoin address",
      );
    }
    if (!isValidNoCoordPublicKey(stakerInfo.publicKeyNoCoordHex)) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        "Invalid staker public key",
      );
    }
    if (
      finalityProviderPksNoCoordHex.length === 0 || 
      !finalityProviderPksNoCoordHex.every(isValidNoCoordPublicKey)
    ) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        "Invalid finality providers public keys",
      );
    }
    validateParams(params);
    validateStakingTimelock(stakingTimelock, params);

    this.network = network;
    this.stakerInfo = stakerInfo;
    this.params = params;
    this.finalityProviderPksNoCoordHex = finalityProviderPksNoCoordHex;
    this.stakingTimelock = stakingTimelock;
  }

  /**
   * buildScripts builds the staking scripts for the staking transaction.
   * Note: different staking types may have different scripts.
   * e.g the observable staking script has a data embed script.
   *
   * @returns {StakingScripts} - The staking scripts.
   */
  buildScripts(): StakingScripts {
    const { covenantQuorum, covenantNoCoordPks, unbondingTime } = this.params;
    // Create staking script data
    let stakingScriptData;
    try {
      stakingScriptData = new StakingScriptData(
        Buffer.from(this.stakerInfo.publicKeyNoCoordHex, "hex"),
        this.finalityProviderPksNoCoordHex.map((pk) => Buffer.from(pk, "hex")),
        toBuffers(covenantNoCoordPks),
        covenantQuorum,
        this.stakingTimelock,
        unbondingTime,
      );
    } catch (error: unknown) {
      throw StakingError.fromUnknown(
        error,
        StakingErrorCode.SCRIPT_FAILURE,
        "Cannot build staking script data",
      );
    }

    // Build scripts
    let scripts;
    try {
      scripts = stakingScriptData.buildScripts();
    } catch (error: unknown) {
      throw StakingError.fromUnknown(
        error,
        StakingErrorCode.SCRIPT_FAILURE,
        "Cannot build staking scripts",
      );
    }
    return scripts;
  }

  /**
   * Create a staking transaction for staking.
   *
   * @param {number} stakingAmountSat - The amount to stake in satoshis.
   * @param {UTXO[]} inputUTXOs - The UTXOs to use as inputs for the staking
   * transaction.
   * @param {number} feeRate - The fee rate for the transaction in satoshis per byte.
   * @returns {TransactionResult} - An object containing the unsigned
   * transaction, and fee
   * @throws {StakingError} - If the transaction cannot be built
   */
  public createStakingTransaction(
    stakingAmountSat: number,
    inputUTXOs: UTXO[],
    feeRate: number,
  ): TransactionResult {
    validateStakingTxInputData(
      stakingAmountSat,
      this.stakingTimelock,
      this.params,
      inputUTXOs,
      feeRate,
    );

    const scripts = this.buildScripts();

    try {
      const { transaction, fee } = stakingTransaction(
        scripts,
        stakingAmountSat,
        this.stakerInfo.address,
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
        error,
        StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build unsigned staking transaction",
      );
    }
  }

  /**
   * Creates a staking expansion transaction that extends an existing BTC stake
   * to new finality providers or renews the timelock.
   * 
   * This method implements RFC 037 BTC Stake Expansion,
   * allowing existing active BTC staking transactions
   * to extend their delegation to new finality providers without going through
   * the full unbonding process.
   * 
   * The expansion transaction:
   * 1. Spends the previous staking transaction output as the first input
   * 2. Uses funding UTXOs as additional inputs to cover transaction fees
   * 3. Creates new staking outputs with expanded finality provider coverage or
   *    renews the timelock
   * 4. Returns any remaining funds as change
   * 
   * @param {number} stakingAmountSat - The total staking amount in satoshis
   * (The amount had to be equal to the previous staking amount for now, this
   * lib does not yet support increasing the staking amount)
   * @param {UTXO[]} inputUTXOs - Available UTXOs to use for funding the
   * expansion transaction fees. Only one will be selected for the expansion
   * @param {number} feeRate - Fee rate in satoshis per byte for the 
   * expansion transaction
   * @param {StakingParams} paramsForPreviousStakingTx - Staking parameters 
   * used in the previous staking transaction
   * @param {Object} previousStakingTxInfo - Necessary information to spend the
   * previous staking transaction.
   * @returns {TransactionResult} - An object containing the unsigned expansion
   * transaction and calculated fee
   * @throws {StakingError} - If the transaction cannot be built or validation
   * fails
   */
  public createStakingExpansionTransaction(
    stakingAmountSat: number,
    inputUTXOs: UTXO[],
    feeRate: number,
    paramsForPreviousStakingTx: StakingParams,
    previousStakingTxInfo: {
      stakingTx: Transaction,
      stakingInput: {
        finalityProviderPksNoCoordHex: string[],
        stakingTimelock: number,
      },
    },
  ): TransactionResult {
    // Validate input parameters (amount, timelock, UTXOs, fee rate)
    validateStakingTxInputData(
      stakingAmountSat,
      this.stakingTimelock,
      this.params,
      inputUTXOs,
      feeRate,
    );

    // Create a Staking instance for the previous staking transaction
    // This allows us to build the scripts needed to spend the previous
    // staking output
    const previousStaking = new Staking(
      this.network,
      this.stakerInfo,
      paramsForPreviousStakingTx,
      previousStakingTxInfo.stakingInput.finalityProviderPksNoCoordHex,
      previousStakingTxInfo.stakingInput.stakingTimelock,
    );
    
    // Build the expansion transaction using the expandStakingTransaction
    // utility function.
    // This creates a transaction that spends the previous staking output and
    // creates new staking outputs
    const {
      transaction: expandedStakingTx,
      fee: expandedStakingTxFee,
    } = expandStakingTransaction(
      this.network,
      this.buildScripts(), // New scripts with expanded finality providers
      stakingAmountSat,
      this.stakerInfo.address,
      feeRate,
      inputUTXOs,
      {
        stakingTx: previousStakingTxInfo.stakingTx,
        scripts: previousStaking.buildScripts(),
      },
    )

    return {
      transaction: expandedStakingTx,
      fee: expandedStakingTxFee,
    };
  }

  /**
   * Create a staking psbt based on the existing staking transaction.
   *
   * @param {Transaction} stakingTx - The staking transaction.
   * @param {UTXO[]} inputUTXOs - The UTXOs to use as inputs for the staking
   * transaction. The UTXOs that were used to create the staking transaction should
   * be included in this array.
   * @returns {Psbt} - The psbt.
   */
  public toStakingPsbt(stakingTx: Transaction, inputUTXOs: UTXO[]): Psbt {
    // Check the staking output index can be found
    const scripts = this.buildScripts();
    const stakingOutputInfo = deriveStakingOutputInfo(scripts, this.network);
    findMatchingTxOutputIndex(
      stakingTx,
      stakingOutputInfo.outputAddress,
      this.network,
    );

    return stakingPsbt(
      stakingTx,
      this.network,
      inputUTXOs,
      isTaproot(this.stakerInfo.address, this.network)
        ? Buffer.from(this.stakerInfo.publicKeyNoCoordHex, "hex")
        : undefined,
    );
  }

  /**
   * Create an unbonding transaction for staking.
   *
   * @param {Transaction} stakingTx - The staking transaction to unbond.
   * @returns {TransactionResult} - An object containing the unsigned
   * transaction, and fee
   * @throws {StakingError} - If the transaction cannot be built
   */
  public createUnbondingTransaction(stakingTx: Transaction): TransactionResult {
    // Build scripts
    const scripts = this.buildScripts();
    const { outputAddress } = deriveStakingOutputInfo(scripts, this.network);
    // Reconstruct the stakingOutputIndex
    const stakingOutputIndex = findMatchingTxOutputIndex(
      stakingTx,
      outputAddress,
      this.network,
    );
    // Create the unbonding transaction
    try {
      const { transaction } = unbondingTransaction(
        scripts,
        stakingTx,
        this.params.unbondingFeeSat,
        this.network,
        stakingOutputIndex,
      );
      return {
        transaction,
        fee: this.params.unbondingFeeSat,
      };
    } catch (error) {
      throw StakingError.fromUnknown(
        error,
        StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build the unbonding transaction",
      );
    }
  }

  /**
   * Create an unbonding psbt based on the existing unbonding transaction and
   * staking transaction.
   *
   * @param {Transaction} unbondingTx - The unbonding transaction.
   * @param {Transaction} stakingTx - The staking transaction.
   *
   * @returns {Psbt} - The psbt.
   */
  public toUnbondingPsbt(
    unbondingTx: Transaction,
    stakingTx: Transaction,
  ): Psbt {
    return unbondingPsbt(
      this.buildScripts(),
      unbondingTx,
      stakingTx,
      this.network,
    );
  }

  /**
   * Creates a withdrawal transaction that spends from an unbonding or slashing
   * transaction. The timelock on the input transaction must have expired before
   * this withdrawal can be valid.
   *
   * @param {Transaction} earlyUnbondedTx - The unbonding or slashing
   * transaction to withdraw from
   * @param {number} feeRate - Fee rate in satoshis per byte for the withdrawal
   * transaction
   * @returns {PsbtResult} - Contains the unsigned PSBT and fee amount
   * @throws {StakingError} - If the input transaction is invalid or withdrawal
   * transaction cannot be built
   */
  public createWithdrawEarlyUnbondedTransaction(
    earlyUnbondedTx: Transaction,
    feeRate: number,
  ): PsbtResult {
    // Build scripts
    const scripts = this.buildScripts();

    // Create the withdraw early unbonded transaction
    try {
      return withdrawEarlyUnbondedTransaction(
        scripts,
        earlyUnbondedTx,
        this.stakerInfo.address,
        this.network,
        feeRate,
      );
    } catch (error) {
      throw StakingError.fromUnknown(
        error,
        StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build unsigned withdraw early unbonded transaction",
      );
    }
  }

  /**
   * Create a withdrawal psbt that spends a naturally expired staking
   * transaction.
   *
   * @param {Transaction} stakingTx - The staking transaction to withdraw from.
   * @param {number} feeRate - The fee rate for the transaction in satoshis per byte.
   * @returns {PsbtResult} - An object containing the unsigned psbt and fee
   * @throws {StakingError} - If the delegation is invalid or the transaction cannot be built
   */
  public createWithdrawStakingExpiredPsbt(
    stakingTx: Transaction,
    feeRate: number,
  ): PsbtResult {
    // Build scripts
    const scripts = this.buildScripts();
    const { outputAddress } = deriveStakingOutputInfo(scripts, this.network);
    // Reconstruct the stakingOutputIndex
    const stakingOutputIndex = findMatchingTxOutputIndex(
      stakingTx,
      outputAddress,
      this.network,
    );

    // Create the timelock unbonded transaction
    try {
      return withdrawTimelockUnbondedTransaction(
        scripts,
        stakingTx,
        this.stakerInfo.address,
        this.network,
        feeRate,
        stakingOutputIndex,
      );
    } catch (error) {
      throw StakingError.fromUnknown(
        error,
        StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build unsigned timelock unbonded transaction",
      );
    }
  }

  /**
   * Create a slashing psbt spending from the staking output.
   *
   * @param {Transaction} stakingTx - The staking transaction to slash.
   * @returns {PsbtResult} - An object containing the unsigned psbt and fee
   * @throws {StakingError} - If the delegation is invalid or the transaction cannot be built
   */
  public createStakingOutputSlashingPsbt(stakingTx: Transaction): PsbtResult {
    if (!this.params.slashing) {
      throw new StakingError(
        StakingErrorCode.INVALID_PARAMS,
        "Slashing parameters are missing",
      );
    }

    // Build scripts
    const scripts = this.buildScripts();

    // Get the staking output address
    const { outputAddress } = deriveStakingOutputInfo(scripts, this.network);

    // Reconstruct the stakingOutputIndex
    const stakingOutputIndex = findMatchingTxOutputIndex(
      stakingTx,
      outputAddress,
      this.network,
    )

    // create the slash timelock unbonded transaction
    try {
      const { psbt } = slashTimelockUnbondedTransaction(
        scripts,
        stakingTx,
        this.params.slashing.slashingPkScriptHex,
        this.params.slashing.slashingRate,
        this.params.slashing.minSlashingTxFeeSat,
        this.network,
        stakingOutputIndex,
      );
      return {
        psbt,
        fee: this.params.slashing.minSlashingTxFeeSat,
      };
    } catch (error) {
      throw StakingError.fromUnknown(
        error,
        StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build the slash timelock unbonded transaction",
      );
    }
  }

  /**
   * Create a slashing psbt for an unbonding output.
   *
   * @param {Transaction} unbondingTx - The unbonding transaction to slash.
   * @returns {PsbtResult} - An object containing the unsigned psbt and fee
   * @throws {StakingError} - If the delegation is invalid or the transaction cannot be built
   */
  public createUnbondingOutputSlashingPsbt(
    unbondingTx: Transaction,
  ): PsbtResult {
    if (!this.params.slashing) {
      throw new StakingError(
        StakingErrorCode.INVALID_PARAMS,
        "Slashing parameters are missing",
      );
    }
    // Build scripts
    const scripts = this.buildScripts();

    // create the slash timelock unbonded transaction
    try {
      const { psbt } = slashEarlyUnbondedTransaction(
        scripts,
        unbondingTx,
        this.params.slashing.slashingPkScriptHex,
        this.params.slashing.slashingRate,
        this.params.slashing.minSlashingTxFeeSat,
        this.network,
      );
      return {
        psbt,
        fee: this.params.slashing.minSlashingTxFeeSat,
      };
    } catch (error) {
      throw StakingError.fromUnknown(
        error,
        StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build the slash early unbonded transaction",
      );
    }
  }

  /**
   * Create a withdraw slashing psbt that spends a slashing transaction from the
   * staking output.
   *
   * @param {Transaction} slashingTx - The slashing transaction.
   * @param {number} feeRate - The fee rate for the transaction in satoshis per byte.
   * @returns {PsbtResult} - An object containing the unsigned psbt and fee
   * @throws {StakingError} - If the delegation is invalid or the transaction cannot be built
   */
  public createWithdrawSlashingPsbt(
    slashingTx: Transaction,
    feeRate: number,
  ): PsbtResult {
    // Build scripts
    const scripts = this.buildScripts();
    const slashingOutputInfo = deriveSlashingOutput(scripts, this.network);

    // Reconstruct and validate the slashingOutputIndex
    const slashingOutputIndex = findMatchingTxOutputIndex(
      slashingTx,
      slashingOutputInfo.outputAddress,
      this.network,
    );

    // Create the withdraw slashed transaction
    try {
      return withdrawSlashingTransaction(
        scripts,
        slashingTx,
        this.stakerInfo.address,
        this.network,
        feeRate,
        slashingOutputIndex,
      );
    } catch (error) {
      throw StakingError.fromUnknown(
        error,
        StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build withdraw slashing transaction",
      );
    }
  }
}
