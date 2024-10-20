import { networks, Transaction } from "bitcoinjs-lib";
import { StakingParams } from "../../types/params";
import { UTXO } from "../../types/UTXO";
import { StakingScriptData, StakingScripts } from "../base/stakingScript";
import { StakingError, StakingErrorCode } from "../../error";
import { 
  stakingTransaction, unbondingTransaction,
  withdrawEarlyUnbondedTransaction,
  withdrawTimelockUnbondedTransaction
} from "../base/transactions";
import { 
  isTaproot,
  isValidBitcoinAddress, isValidNoCoordPublicKey
} from "../../utils/btc";
import { validateStakingTxInputData } from "../../utils/staking";
import { PsbtTransactionResult } from "../../types/transaction";
import { pksToBuffers } from "../../utils/staking";
export * from "../base/stakingScript";

// minimum unbonding output value to avoid the unbonding output value being
// less than Bitcoin dust
const MIN_UNBONDING_OUTPUT_VALUE = 1000;

export interface StakerInfo {
  address: string;
  publicKeyNoCoordHex: string;
}

export interface Delegation {
  stakingTxHashHex: string;
  stakerPkNoCoordHex: string;
  finalityProviderPkNoCoordHex: string;
  stakingTx: Transaction;
  stakingOutputIndex: number;
  startHeight: number;
  timelock: number;
}

export class Staking {
  network: networks.Network;
  stakerInfo: StakerInfo;

  constructor(network: networks.Network, stakerInfo: StakerInfo) {
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
    this.network = network;
    this.stakerInfo = stakerInfo;
  }

  /**
   * buildScripts builds the staking scripts for the staking transaction.
   * Note: different staking types may have different scripts.
   * e.g the observable staking script has a data embed script.
   * @param {StakingParams} params - The staking parameters.
   * @param {string} finalityProviderPkNoCoordHex - The finality provider's public key
   * without coordinates.
   * @param {number} timelock - The staking time in blocks.
   * @param {string} stakerPkNoCoordHex - The staker's public key without coordinates.
   * 
   * @returns {StakingScripts} - The staking scripts.
   */
  buildScripts(
    params: StakingParams,
    finalityProviderPkNoCoordHex: string,
    timelock: number,
    stakerPkNoCoordHex: string
  ): StakingScripts {
    // Create staking script data
    let stakingScriptData;
    try {
      stakingScriptData = new StakingScriptData(
        Buffer.from(stakerPkNoCoordHex, "hex"),
        [Buffer.from(finalityProviderPkNoCoordHex, "hex")],
        pksToBuffers(params.covenantNoCoordPks),
        params.covenantQuorum,
        timelock,
        params.unbondingTime
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
   * Validate the staking parameters.
   * Extend this method to add additional validation for staking parameters based
   * on the staking type.
   * @param {StakingParams} params - The staking parameters.
   * @throws {StakingError} - If the parameters are invalid.
   */
  validateParams(params: StakingParams) {
    // Check covenant public keys
    if (params.covenantNoCoordPks.length == 0) {
      throw new StakingError(
        StakingErrorCode.INVALID_PARAMS,
        "Could not find any covenant public keys",
      );
    }
    if (params.covenantNoCoordPks.length < params.covenantQuorum) {
      throw new StakingError(
        StakingErrorCode.INVALID_PARAMS,
        "Covenant public keys must be greater than or equal to the quorum",
      );
    }
    params.covenantNoCoordPks.forEach((pk) => {
      if (!isValidNoCoordPublicKey(pk)) {
        throw new StakingError(
          StakingErrorCode.INVALID_PARAMS,
          "Covenant public key should contains no coordinate",
        );
      }
    });
    // Check other parameters
    if (params.unbondingTime <= 0) {
      throw new StakingError(
        StakingErrorCode.INVALID_PARAMS,
        "Unbonding time must be greater than 0",
      );
    }
    if (params.unbondingFeeSat <= 0) {
      throw new StakingError(
        StakingErrorCode.INVALID_PARAMS,
        "Unbonding fee must be greater than 0",
      );
    }
    if (params.maxStakingAmountSat < params.minStakingAmountSat) {
      throw new StakingError(
        StakingErrorCode.INVALID_PARAMS,
        "Max staking amount must be greater or equal to min staking amount",
      );
    }
    if (params.minStakingAmountSat < params.unbondingFeeSat + MIN_UNBONDING_OUTPUT_VALUE) {
      throw new StakingError(
        StakingErrorCode.INVALID_PARAMS,
        `Min staking amount must be greater than unbonding fee plus ${MIN_UNBONDING_OUTPUT_VALUE}`,
      );
    }
    if (params.maxStakingTimeBlocks < params.minStakingTimeBlocks) {
      throw new StakingError(
        StakingErrorCode.INVALID_PARAMS,
        "Max staking time must be greater or equal to min staking time",
      );
    }
    if (params.minStakingTimeBlocks <= 0) {
      throw new StakingError(
        StakingErrorCode.INVALID_PARAMS,
        "Min staking time must be greater than 0",
      );
    }
    if (params.covenantQuorum <= 0) {
      throw new StakingError(
        StakingErrorCode.INVALID_PARAMS,
        "Covenant quorum must be greater than 0",
      );
    }
  }

  /**
   * Validate the Babylon delegation inputs.
   * 
   * @param {Delegation} delegation - The delegation to validate.
   * @param {StakingParams} stakingParams - The staking parameters.
   * @param {StakerInfo} stakerInfo - The staker information.
   * 
   * @throws {StakingError} - If the delegation inputs are invalid.
   */
  validateDelegationInputs(
    delegation: Delegation,
    stakingParams: StakingParams,
    stakerInfo: StakerInfo,
  ) {
    const { stakingTx, timelock, stakingOutputIndex } = delegation;
    if (
      timelock < stakingParams.minStakingTimeBlocks ||
      timelock > stakingParams.maxStakingTimeBlocks
    ) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        "Staking transaction timelock is out of range",
      );
    }

    if (delegation.stakerPkNoCoordHex !== stakerInfo.publicKeyNoCoordHex) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        "Staker public key does not match between connected staker and delegation staker",
      );
    }

    if (!isValidNoCoordPublicKey(delegation.finalityProviderPkNoCoordHex)) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        "Finality provider public key should not have a coordinate",
      );
    }

    if (!stakingTx.outs[stakingOutputIndex]) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        "Staking transaction output index is out of range",
      );
    }

    if (stakingTx.getId() !== delegation.stakingTxHashHex) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        "Staking transaction hash does not match between the btc transaction and the provided staking hash",
      );
    }
  }

  /**
   * Create a staking transaction for staking.
   * 
   * @param {Params} params - The staking parameters for staking.
   * @param {number} stakingAmountSat - The amount to stake in satoshis.
   * @param {number} timelock - The staking time in blocks.
   * @param {string} finalityProviderPkNoCoord - The finality provider's public key
   * without coordinates.
   * @param {UTXO[]} inputUTXOs - The UTXOs to use as inputs for the staking 
   * transaction.
   * @param {number} feeRate - The fee rate for the transaction in satoshis per byte.
   * 
   * @returns {PsbtTransactionResult} - An object containing the unsigned psbt and fee
   */
  public createStakingTransaction (
    params: StakingParams,
    stakingAmountSat: number,
    timelock: number,
    finalityProviderPkNoCoord: string,
    inputUTXOs: UTXO[],
    feeRate: number,
  ): PsbtTransactionResult {
    this.validateParams(params);
    validateStakingTxInputData(
      stakingAmountSat,
      timelock,
      params,
      inputUTXOs,
      feeRate,
      finalityProviderPkNoCoord,
    );

    const scripts = this.buildScripts(
      params,
      finalityProviderPkNoCoord,
      timelock,
      this.stakerInfo.publicKeyNoCoordHex,
    );

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
   * Create an unbonding transaction for observable staking.
   * 
   * @param {ObservableStakingParams} stakingParams - The staking parameters for observable staking.
   * @param {Delegation} delegation - The delegation to unbond.
   * 
   * @returns {Psbt} - The unsigned unbonding transaction
   * 
   * @throws {StakingError} - If the delegation is invalid or the transaction cannot be built
   */
  public createUnbondingTransaction = (
    stakingParams: StakingParams,
    delegation: Delegation,
  ) : PsbtTransactionResult => {
    this.validateParams(stakingParams);
    this.validateDelegationInputs(
      delegation, stakingParams, this.stakerInfo,
    );
    const { 
      stakingTx,
      stakingOutputIndex,
      timelock,
      finalityProviderPkNoCoordHex,
      stakerPkNoCoordHex
    } = delegation;
    // Build scripts
    const scripts = this.buildScripts(
      stakingParams,
      finalityProviderPkNoCoordHex,
      timelock,
      stakerPkNoCoordHex,
    );
    // Create the unbonding transaction
    try {
      const { psbt } = unbondingTransaction(
        scripts,
        stakingTx,
        stakingParams.unbondingFeeSat,
        this.network,
        stakingOutputIndex,
      );
      return { psbt, fee: stakingParams.unbondingFeeSat };
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
   * @param {P} stakingParams - The staking parameters for observable staking.
   * @param {Delegation} delegation - The delegation that has been on-demand unbonded.
   * @param {Transaction} unbondingTx - The unbonding transaction to withdraw from.
   * @param {number} feeRate - The fee rate for the transaction in satoshis per byte.
   * 
   * @returns {PsbtTransactionResult} - An object containing the unsigned psbt and fee
   * 
   * @throws {StakingError} - If the delegation is invalid or the transaction cannot be built
   */
  public createWithdrawEarlyUnbondedTransaction = (
    stakingParams: StakingParams,
    delegation: Delegation,
    unbondingTx: Transaction,
    feeRate: number,
  ): PsbtTransactionResult => {
    this.validateParams(stakingParams);
    this.validateDelegationInputs(
      delegation, stakingParams, this.stakerInfo,
    );
    const {
      timelock,
      finalityProviderPkNoCoordHex,
      stakerPkNoCoordHex
    } = delegation;
    // Build scripts
    const scripts = this.buildScripts(
      stakingParams,
      finalityProviderPkNoCoordHex,
      timelock,
      stakerPkNoCoordHex,
    );

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
   * @param {P} stakingParams - The staking parameters for observable staking.
   * @param {Delegation} delegation - The delegation to withdraw from.
   * @param {number} feeRate - The fee rate for the transaction in satoshis per byte.
   * 
   * @returns {PsbtTransactionResult} - An object containing the unsigned psbt and fee
   * 
   * @throws {StakingError} - If the delegation is invalid or the transaction cannot be built
   */
  public createWithdrawTimelockUnbondedTransaction = (
    stakingParams: StakingParams,
    delegation: Delegation,
    feeRate: number,
  ): PsbtTransactionResult => {
    this.validateParams(stakingParams);
    this.validateDelegationInputs(
      delegation, stakingParams, this.stakerInfo,
    );
    const { 
      stakingTx,
      stakingOutputIndex,
      timelock,
      finalityProviderPkNoCoordHex,
      stakerPkNoCoordHex,
    } = delegation;

    // Build scripts
    const scripts = this.buildScripts(
      stakingParams,
      finalityProviderPkNoCoordHex,
      timelock,
      stakerPkNoCoordHex,
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
        error, StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build unsigned timelock unbonded transaction",
      );
    }
  }
}
