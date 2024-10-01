import { networks, Transaction } from "bitcoinjs-lib";
import { ObservableStakingParams } from "../../types/params";
import { UTXO } from "../../types/UTXO";
import { StakingScripts } from "../stakingScript";
import { StakingScriptData } from "../stakingScript";
import { StakingError, StakingErrorCode } from "../../error";
import { 
  stakingTransaction, unbondingTransaction,
  withdrawEarlyUnbondedTransaction,
  withdrawTimelockUnbondedTransaction
} from "..";
import { 
  isTaproot,
  isValidBitcoinAddress, isValidNoCoordPublicKey
} from "../../utils/btc";
import { validateParams, validateStakingTxInputData } from "../../utils/staking";
import { PsbtTransactionResult } from "../../types/transaction";

export interface StakerInfo {
  address: string;
  publicKeyNoCoordHex: string;
}

export interface ObservableDelegation {
  stakingTxHashHex: string;
  stakerPkNoCoordHex: string;
  finalityProviderPkNoCoordHex: string;
  stakingTx: Transaction;
  stakingOutputIndex: number;
  startHeight: number;
  timelock: number;
}

/**
 * ObservableStaking is a class that provides an interface to create observable
 * staking transactions for the Babylon Staking protocol.
 * 
 * The class requires a network and staker information to create staking
 * transactions.
 * The staker information includes the staker's address and 
 * public key(without coordinates).
 */
export class ObservableStaking {
  private network: networks.Network;
  private stakerInfo: StakerInfo;

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
   * Create a staking transaction for observable staking.
   * 
   * @param {ObservableStakingParams} params - The staking parameters for observable staking.
   * @param {number} stakingAmountSat - The amount to stake in satoshis.
   * @param {number} stakingTimeBlocks - The time to stake in blocks.
   * @param {string} finalityProviderPkNoCoord - The finality provider's public key
   * without coordinates.
   * @param {UTXO[]} inputUTXOs - The UTXOs to use as inputs for the staking 
   * transaction.
   * @param {number} feeRate - The fee rate for the transaction in satoshis per byte.
   * 
   * @returns {PsbtTransactionResult} - An object containing the unsigned psbt and fee
   */
  public createStakingTransaction = (
    params: ObservableStakingParams,
    stakingAmountSat: number,
    stakingTerm: number,
    finalityProviderPkNoCoord: string,
    inputUTXOs: UTXO[],
    feeRate: number,
  ): PsbtTransactionResult => {
    validateParams(params);
    validateStakingTxInputData(
      stakingAmountSat,
      stakingTerm,
      params,
      inputUTXOs,
      feeRate,
      finalityProviderPkNoCoord,
    );

    const scripts = buildScripts(
      params,
      finalityProviderPkNoCoord,
      stakingTerm,
      this.stakerInfo.publicKeyNoCoordHex,
    );

    // Create the staking transaction
    try {
      return stakingTransaction(
        scripts,
        stakingAmountSat,
        this.stakerInfo.address,
        inputUTXOs,
        this.network,
        feeRate,
        isTaproot(this.stakerInfo.address, this.network) ? Buffer.from(this.stakerInfo.publicKeyNoCoordHex, "hex") : undefined,
        // `lockHeight` is exclusive of the provided value.
        // For example, if a Bitcoin height of X is provided,
        // the transaction will be included starting from height X+1.
        // https://learnmeabitcoin.com/technical/transaction/locktime/
        params.activationHeight - 1,
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
   * @param {ObservableDelegation} delegation - The delegation to unbond.
   * 
   * @returns {Psbt} - The unsigned unbonding transaction
   * 
   * @throws {StakingError} - If the delegation is invalid or the transaction cannot be built
   */
  public createUnbondingTransaction = (
    stakingParams: ObservableStakingParams,
    delegation: ObservableDelegation,
  ) : PsbtTransactionResult => {
    validateParams(stakingParams);
    validateDelegationInputs(
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
    const scripts = buildScripts(
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
   * @param {ObservableStakingParams} stakingParams - The staking parameters for observable staking.
   * @param {ObservableDelegation} delegation - The delegation that has been on-demand unbonded.
   * @param {Transaction} unbondingTx - The unbonding transaction to withdraw from.
   * @param {number} feeRate - The fee rate for the transaction in satoshis per byte.
   * 
   * @returns {PsbtTransactionResult} - An object containing the unsigned psbt and fee
   * 
   * @throws {StakingError} - If the delegation is invalid or the transaction cannot be built
   */
  public createWithdrawEarlyUnbondedTransaction = (
    stakingParams: ObservableStakingParams,
    delegation: ObservableDelegation,
    unbondingTx: Transaction,
    feeRate: number,
  ): PsbtTransactionResult => {
    validateParams(stakingParams);
    validateDelegationInputs(
      delegation, stakingParams, this.stakerInfo,
    );
    const {
      timelock,
      finalityProviderPkNoCoordHex,
      stakerPkNoCoordHex
    } = delegation;
    // Build scripts
    const scripts = buildScripts(
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
   * @param {ObservableStakingParams} stakingParams - The staking parameters for observable staking.
   * @param {ObservableDelegation} delegation - The delegation to withdraw from.
   * @param {number} feeRate - The fee rate for the transaction in satoshis per byte.
   * 
   * @returns {PsbtTransactionResult} - An object containing the unsigned psbt and fee
   * 
   * @throws {StakingError} - If the delegation is invalid or the transaction cannot be built
   */
  public createWithdrawTimelockUnbondedTransaction = (
    stakingParams: ObservableStakingParams,
    delegation: ObservableDelegation,
    feeRate: number,
  ): PsbtTransactionResult => {
    validateParams(stakingParams);
    validateDelegationInputs(
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
    const scripts = buildScripts(
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

export const validateDelegationInputs = (
  delegation: ObservableDelegation,
  stakingParams: ObservableStakingParams,
  stakerInfo: StakerInfo,
) => {
  const { stakingTx, startHeight, timelock, stakingOutputIndex } = delegation;
  if (startHeight < stakingParams.activationHeight) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT,
      "Staking transaction start height cannot be less than activation height",
    );
  }

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

export const buildScripts = (
  params: ObservableStakingParams,
  finalityProviderPkNoCoordHex: string,
  stakingTerm: number,
  stakerPkNoCoordHex: string,
): StakingScripts => {
  // Convert covenant PKs to buffers
  let covenantNoCoordPKsBuffer;
  try {
    covenantNoCoordPKsBuffer = params.covenantNoCoordPks.map((pk) =>
      Buffer.from(pk, "hex")
    );
  } catch (error) {
    throw StakingError.fromUnknown(
      error, StakingErrorCode.INVALID_INPUT,
      "Cannot convert covenant public keys from the params to buffers",
    );
  }
  
  // Create staking script data
  let stakingScriptData;
  try {
    stakingScriptData = new StakingScriptData(
      Buffer.from(stakerPkNoCoordHex, "hex"),
      [Buffer.from(finalityProviderPkNoCoordHex, "hex")],
      covenantNoCoordPKsBuffer,
      params.covenantQuorum,
      stakingTerm,
      params.unbondingTime,
      Buffer.from(params.tag, "hex"),
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
};