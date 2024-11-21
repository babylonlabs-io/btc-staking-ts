import { networks, Psbt, Transaction } from "bitcoinjs-lib";
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
  isTaproot,
  isValidBitcoinAddress, isValidNoCoordPublicKey
} from "../utils/btc";
import { 
  deriveStakingOutputAddress,
  findMatchingStakingTxOutputIndex,
  validateParams,
  validateStakingTimelock,
  validateStakingTxInputData,
} from "../utils/staking";
import { PsbtResult, TransactionResult } from "../types/transaction";
import { toBuffers } from "../utils/staking";
import { stakingPsbt, unbondingPsbt } from "./psbt";
import { CovenantSignature } from "../types/covenantSignatures";
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
   * @param {UTXO[]} inputUTXOs - The UTXOs to use as inputs for the staking 
   * transaction.
   * @param {number} feeRate - The fee rate for the transaction in satoshis per byte.
   * @returns {TransactionResult} - An object containing the unsigned transaction
   * and fee
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
      // Do a dry run of stakingPsbt to ensure the transaction can be converted to PSBT
      // with all the required properties before returning it
      stakingPsbt(
        transaction,
        this.network,
        inputUTXOs,
        isTaproot(
          this.stakerInfo.address, this.network
        ) ? Buffer.from(this.stakerInfo.publicKeyNoCoordHex, "hex") : undefined,
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
   * Create a staking psbt based on the existing staking transaction.
   * 
   * @param {Transaction} stakingTx - The staking transaction.
   * @param {UTXO[]} inputUTXOs - The UTXOs to use as inputs for the staking 
   * transaction. The UTXOs that were used to create the staking transaction should
   * be included in this array.
   * @returns {Psbt} - The psbt.
   */
  public createStakingPsbt(
    stakingTx: Transaction,
    inputUTXOs: UTXO[],
  ): Psbt {
    return stakingPsbt(
      stakingTx,
      this.network,
      inputUTXOs,
      isTaproot(
        this.stakerInfo.address, this.network
      ) ? Buffer.from(this.stakerInfo.publicKeyNoCoordHex, "hex") : undefined,
    );
  }

  /**
   * Create an unbonding transaction for staking.
   * 
   * @param {Transaction} stakingTx - The staking transaction to unbond.
   * @returns {TransactionResult} - An object containing the unsigned transaction
   * and fee
   * @throws {StakingError} - If the transaction cannot be built
   */
  public createUnbondingTransaction(
    stakingTx: Transaction,
    covenantSigs?: CovenantSignature[],
  ) : TransactionResult {    
    // Build scripts
    const scripts = this.buildScripts();

    // Reconstruct the stakingOutputIndex
    const stakingOutputIndex = findMatchingStakingTxOutputIndex(
      stakingTx,
      deriveStakingOutputAddress(scripts, this.network),
      this.network,
    )
    // Create the unbonding transaction
    try {
      const { transaction } = unbondingTransaction(
        scripts,
        stakingTx,
        this.params.unbondingFeeSat,
        this.network,
        stakingOutputIndex,
      );
      // Do a dry run of unbondingPsbt to ensure the transaction can be converted to PSBT
      // with all the required properties before returning it
      unbondingPsbt(
        scripts,
        transaction,
        stakingTx,
        this.network,
        this.params.covenantNoCoordPks,
      );
      return {
        transaction,
        fee: this.params.unbondingFeeSat,
      };
    } catch (error) {
      throw StakingError.fromUnknown(
        error, StakingErrorCode.BUILD_TRANSACTION_FAILURE,
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
   * @param {CovenantSignature[]} [covenantSigs] - covenant signatures used to 
   * combine with staker signatures to unbond the staking transaction
   * 
   * @returns {Psbt} - The psbt.
   */
  public createUnbondingPsbt(
    unbondingTx: Transaction,
    stakingTx: Transaction,
    covenantSigs: CovenantSignature[],
  ): Psbt {
    return unbondingPsbt(
      this.buildScripts(),
      unbondingTx,
      stakingTx,
      this.network,
      this.params.covenantNoCoordPks,
      covenantSigs,
    );
  }

  /**
   * Create a withdrawal transaction that spends an unbonding transaction.
   * 
   * @param {Transaction} unbondingTx - The unbonding transaction to withdraw from.
   * @param {number} feeRate - The fee rate for the transaction in satoshis per byte.
   * @returns {PsbtResult} - An object containing the unsigned psbt and fee
   * @throws {StakingError} - If the delegation is invalid or the transaction cannot be built
   */
  public createWithdrawEarlyUnbondedTransaction (
    unbondingTx: Transaction,
    feeRate: number,
  ): PsbtResult {
    // Build scripts
    const scripts = this.buildScripts();

    // Create the withdraw early unbonded transaction
    try {
      const { psbt, fee } = withdrawEarlyUnbondedTransaction(
        scripts,
        unbondingTx,
        this.stakerInfo.address,
        this.network,
        feeRate,
      );  
      return {
        psbt,
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
   * Create a withdrawal transaction that spends a naturally expired staking 
   * transaction.
   * 
   * @param {Transaction} stakingTx - The staking transaction to withdraw from.
   * @param {number} feeRate - The fee rate for the transaction in satoshis per byte.
   * @returns {PsbtResult} - An object containing the unsigned psbt and fee
   * @throws {StakingError} - If the delegation is invalid or the transaction cannot be built
   */
  public createWithdrawTimelockUnbondedTransaction(
    stakingTx: Transaction,
    feeRate: number,
  ): PsbtResult {
    // Build scripts
    const scripts = this.buildScripts();

    // Reconstruct the stakingOutputIndex
    const stakingOutputIndex = findMatchingStakingTxOutputIndex(
      stakingTx,
      deriveStakingOutputAddress(scripts, this.network),
      this.network,
    )

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
   * Create a slashing transaction spending from the staking output.
   * 
   * @param {Transaction} stakingTx - The staking transaction to slash.
   * @returns {PsbtResult} - An object containing the unsigned psbt and fee
   * @throws {StakingError} - If the delegation is invalid or the transaction cannot be built
   */
  public createStakingOutputSlashingTransaction(
    stakingTx: Transaction,
  ) : PsbtResult {
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
      const { psbt } = slashTimelockUnbondedTransaction(
        scripts,
        stakingTx,
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
        error, StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build the slash timelock unbonded transaction",
      );
    }
  }

  /**
   * Create a slashing transaction for an unbonding output.
   * 
   * @param {Transaction} unbondingTx - The unbonding transaction to slash.
   * @returns {PsbtResult} - An object containing the unsigned psbt and fee
   * @throws {StakingError} - If the delegation is invalid or the transaction cannot be built
   */
  public createUnbondingOutputSlashingTransaction(
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
        error, StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build the slash early unbonded transaction",
      );
    }
  }
}
