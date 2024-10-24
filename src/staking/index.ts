import { networks, Transaction } from "bitcoinjs-lib";
import { StakingParams } from "../types/params";
import { UTXO } from "../types/UTXO";
import { StakingScriptData, StakingScripts } from "./stakingScript";
import { StakingError, StakingErrorCode } from "../error";
import { 
  slashEarlyUnbondedTransaction,
  slashTimelockUnbondedTransaction,
  stakingTransaction, unbondingTransaction,
  withdrawEarlyUnbondedTransaction,
  withdrawTimelockUnbondedTransaction
} from "./transactions";
import { 
  deriveAddressFromPkScript,
  isTaproot,
  isValidBitcoinAddress, isValidNoCoordPublicKey
} from "../utils/btc";
import { validateParams, validateStakingTimelock, validateStakingTxInputData, validateStakingTxOutputIndex } from "../utils/staking";
import { PsbtTransactionResult } from "../types/transaction";
import { toBuffers } from "../utils/staking";
export * from "./stakingScript";

export interface StakerInfo {
  address: string;
  publicKeyNoCoordHex: string;
}

export class Staking {
  network: networks.Network;
  stakerInfo: StakerInfo;
  params: StakingParams;
  finalityProviderPkNoCoordHex: string;
  stakingTimelock: number;
  
  constructor(
    network: networks.Network,
    stakerInfo: StakerInfo,
    params: StakingParams,
    finalityProviderPkNoCoordHex: string,
    stakingTimelock: number,
  ) {
    // Perform validations
    if (!isValidBitcoinAddress(stakerInfo.address, network)) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT, "Invalid staker bitcoin address",
      );
    }
    if (!isValidNoCoordPublicKey(stakerInfo.publicKeyNoCoordHex)) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT, "Invalid staker public key",
      );
    }
    if (!isValidNoCoordPublicKey(finalityProviderPkNoCoordHex)) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT, "Invalid finality provider public key",
      );
    }
    validateParams(params);
    validateStakingTimelock(stakingTimelock, params);

    this.network = network;
    this.stakerInfo = stakerInfo;
    this.params = params;
    this.finalityProviderPkNoCoordHex = finalityProviderPkNoCoordHex;
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
        [Buffer.from(this.finalityProviderPkNoCoordHex, "hex")],
        toBuffers(covenantNoCoordPks),
        covenantQuorum,
        this.stakingTimelock,
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
   * Create a staking transaction for staking.
   * 
   * @param {number} stakingAmountSat - The amount to stake in satoshis.
   * @param {string} finalityProviderPkNoCoord - The finality provider's public key
   * without coordinates.
   * @param {UTXO[]} inputUTXOs - The UTXOs to use as inputs for the staking 
   * transaction.
   * @param {number} feeRate - The fee rate for the transaction in satoshis per byte.
   * 
   * @returns {PsbtTransactionResult} - An object containing the unsigned psbt and fee
   */
  public createStakingTransaction(
    stakingAmountSat: number,
    inputUTXOs: UTXO[],
    feeRate: number,
  ): PsbtTransactionResult {
    validateStakingTxInputData(
      stakingAmountSat,
      this.stakingTimelock,
      this.params,
      inputUTXOs,
      feeRate,
    );

    const scripts = this.buildScripts();

    try {
      return stakingTransaction(
        scripts,
        stakingAmountSat,
        this.stakerInfo.address,
        inputUTXOs,
        this.network,
        feeRate,
        isTaproot(this.stakerInfo.address, this.network) ? Buffer.from(this.stakerInfo.publicKeyNoCoordHex, "hex") : undefined,
      );
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
   * @param {Transaction} stakingTx - The staking transaction to unbond.
   * @param {number} stakingOutputIndex - The output index of the staking transaction.
   * 
   * @returns {PsbtTransactionResult} - An object containing the unsigned psbt and fee
   * 
   * @throws {StakingError} - If the transaction cannot be built
   */
  public createUnbondingTransaction(
    stakingTx: Transaction,
    stakingOutputIndex: number,
  ) : PsbtTransactionResult {
    validateStakingTxOutputIndex(stakingTx, stakingOutputIndex);
    // Build scripts
    const scripts = this.buildScripts();
    // Create the unbonding transaction
    try {
      const { psbt } = unbondingTransaction(
        scripts,
        stakingTx,
        this.params.unbondingFeeSat,
        this.network,
        stakingOutputIndex,
      );
      return { psbt, fee: this.params.unbondingFeeSat };
    } catch (error) {
      throw StakingError.fromUnknown(
        error, StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build the unbonding transaction",
      );
    }
  }

  /**
   * Create a withdrawal transaction that spends an unbonding transaction for observable staking.  
   * 
   * @param {Transaction} unbondingTx - The unbonding transaction to withdraw from.
   * @param {number} feeRate - The fee rate for the transaction in satoshis per byte.
   * 
   * @returns {PsbtTransactionResult} - An object containing the unsigned psbt and fee
   * 
   * @throws {StakingError} - If the delegation is invalid or the transaction cannot be built
   */
  public createWithdrawEarlyUnbondedTransaction (
    unbondingTx: Transaction,
    feeRate: number,
  ): PsbtTransactionResult {
    // Build scripts
    const scripts = this.buildScripts();

    // Create the withdraw early unbonded transaction
    try {
      return withdrawEarlyUnbondedTransaction(
        scripts,
        unbondingTx,
        this.stakerInfo.address,
        this.network,
        feeRate,
      );  
    } catch (error) {
      throw StakingError.fromUnknown(
        error, StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build unsigned withdraw early unbonded transaction",
      );
    }
  }

  /**
   * Create a withdrawal transaction that spends a naturally expired staking transaction for observable staking.
   * 
   * @param {number} feeRate - The fee rate for the transaction in satoshis per byte.
   * 
   * @returns {PsbtTransactionResult} - An object containing the unsigned psbt and fee
   * 
   * @throws {StakingError} - If the delegation is invalid or the transaction cannot be built
   */
  public createWithdrawTimelockUnbondedTransaction(
    stakingTx: Transaction,
    stakingOutputIndex: number,
    feeRate: number,
  ): PsbtTransactionResult {
    validateStakingTxOutputIndex(stakingTx, stakingOutputIndex);
    // Build scripts
    const scripts = this.buildScripts();

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
        error, StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build unsigned timelock unbonded transaction",
      );
    }
  }

  /**
   * Create a slash timelock unbonded transaction for staking.
   * 
   * @param {Transaction} stakingTx - The staking transaction to slash.
   * without coordinates.
   * 
   * @returns {PsbtTransactionResult} - An object containing the unsigned psbt and fee
   * 
   * @throws {StakingError} - If the delegation is invalid or the transaction cannot be built
   */
  public createSlashTimelockUnbondedTransaction(
    stakingTx: Transaction,
  ) : PsbtTransactionResult {
    if (!this.params.slashing) {
      throw new StakingError(
        StakingErrorCode.INVALID_PARAMS,
        "Slashing parameters are missing",
      );
    }
    const slashingAddress = deriveAddressFromPkScript(
      this.params.slashing.slashingPkScript, this.network,
    );
    
    // Build scripts
    const scripts = this.buildScripts();

    // create the slash timelock unbonded transaction
    try {
      const { psbt } = slashTimelockUnbondedTransaction(
        scripts,
        stakingTx,
        slashingAddress,
        this.params.slashing.slashingRate,
        this.params.slashing.minSlashingTxFeeSat,
        this.network,
      );
      return { psbt, fee: this.params.slashing.minSlashingTxFeeSat };
    } catch (error) {
      throw StakingError.fromUnknown(
        error, StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build the slash timelock unbonded transaction",
      );
    }
  }

  /**
   * Create a slash early unbonded transaction for staking.
   * 
   * @param {Transaction} unbondingTx - The unbonding transaction to slash.
   * 
   * @returns {PsbtTransactionResult} - An object containing the unsigned psbt and fee
   * 
   * @throws {StakingError} - If the delegation is invalid or the transaction cannot be built
   */
  public createSlashEarlyUnbondedTransaction(
    unbondingTx: Transaction,
  ): PsbtTransactionResult {
    if (!this.params.slashing) {
      throw new StakingError(
        StakingErrorCode.INVALID_PARAMS,
        "Slashing parameters are missing",
      );
    }
    const slashingAddress = deriveAddressFromPkScript(
      this.params.slashing.slashingPkScript, this.network,
    );

    // Build scripts
    const scripts = this.buildScripts();

    // create the slash timelock unbonded transaction
    try {
      const { psbt } = slashEarlyUnbondedTransaction(
        scripts,
        unbondingTx,
        slashingAddress,
        this.params.slashing.slashingRate,
        this.params.slashing.minSlashingTxFeeSat,
        this.network,
      );
      return { psbt, fee: this.params.slashing.minSlashingTxFeeSat };
    } catch (error) {
      throw StakingError.fromUnknown(
        error, StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build the slash early unbonded transaction",
      );
    }
  }
}
