import { networks, Psbt, Transaction } from "bitcoinjs-lib";
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
  getPublicKeyNoCoord, isTaproot,
  isValidBitcoinAddress, isValidNoCordPublicKey
} from "../../utils/btc";
import { getStakingTerm, validateParams, validateStakingTxInputData } from "../../utils/staking";
import { PsbtTransactionResult } from "../../types/transaction";

interface StakerInfo {
  address: string;
  publicKeyNoCoordHex: string;
}

interface ObservableStakingTransaction {
  txHex: string;
  stakingOutptuIndex: number;
  startHeight: number;
  timelock: number;
}

interface ObservableDelegation {
  stakingTxHashHex: string;
  stakerPkHex: string;
  finalityProviderPkNoCoordHex: string;
  stakingTx: ObservableStakingTransaction;
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
    if (!isValidNoCordPublicKey(stakerInfo.publicKeyNoCoordHex)) {
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
    stakingTimeBlocks: number,
    finalityProviderPkNoCoord: string,
    inputUTXOs: UTXO[],
    feeRate: number,
  ): PsbtTransactionResult => {
    validateParams(params);
    const stakingTerm = getStakingTerm(params, stakingTimeBlocks);

    validateStakingTxInputData(
      stakingAmountSat,
      stakingTerm,
      params,
      inputUTXOs,
      feeRate,
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
    const {btcStakingTx, stakingTx } = validateAndDecodeDelegationInputs(
      delegation, stakingParams, this.stakerInfo,
    );  
    // Build scripts
    const scripts = buildScripts(
      stakingParams,
      delegation.finalityProviderPkNoCoordHex,
      stakingTx.timelock,
      delegation.stakerPkHex,
    );

    // Create the unbonding transaction
    try {
      const { psbt } = unbondingTransaction(
        scripts,
        btcStakingTx,
        stakingParams.unbondingFeeSat,
        this.network,
        stakingTx.stakingOutptuIndex,
      );
      return { psbt, fee: stakingParams.unbondingFeeSat };
    } catch (error) {
      throw StakingError.fromUnknown(
        error, StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build unsigned unbonding transaction",
      );
    }
  }

  /**
   * Create a withdraw early unbonded transaction for observable staking.
   * 
   * @param {ObservableStakingParams} stakingParams - The staking parameters for observable staking.
   * @param {ObservableDelegation} delegation - The delegation to withdraw early.
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
    const { stakingTx } = validateAndDecodeDelegationInputs(
      delegation, stakingParams, this.stakerInfo,
    );
    // Build scripts
    const scripts = buildScripts(
      stakingParams,
      delegation.finalityProviderPkNoCoordHex,
      stakingTx.timelock,
      delegation.stakerPkHex,
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
   * Create a withdraw timelock unbonded transaction for observable staking.
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
    const { stakingTx, btcStakingTx } = validateAndDecodeDelegationInputs(
      delegation, stakingParams, this.stakerInfo,
    );
    // Build scripts
    const scripts = buildScripts(
      stakingParams,
      delegation.finalityProviderPkNoCoordHex,
      stakingTx.timelock,
      delegation.stakerPkHex,
    );

    // Create the timelock unbonded transaction
    try {
      return withdrawTimelockUnbondedTransaction(
        scripts,
        btcStakingTx,
        this.stakerInfo.address,
        this.network,
        feeRate,
        stakingTx.stakingOutptuIndex,
      );  
    } catch (error) {
      throw StakingError.fromUnknown(
        error, StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build unsigned timelock unbonded transaction",
      );
    }
  }
}

export const validateAndDecodeDelegationInputs = (
  delegation: ObservableDelegation, stakingParams: ObservableStakingParams,
  stakerInfo: StakerInfo,
) => {
  const stakingTx = delegation.stakingTx;
  if (stakingTx.startHeight < stakingParams.activationHeight) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT,
      "Staking transaction start height cannot be less than activation height",
    );
  }

  if (
    stakingTx.timelock < stakingParams.minStakingTimeBlocks ||
    stakingTx.timelock > stakingParams.maxStakingTimeBlocks
  ) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT,
      "Staking transaction timelock is out of range",
    );
  }

  if (delegation.stakerPkHex !== stakerInfo.publicKeyNoCoordHex) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT,
      "Staker public key does not match between connected staker and delegation staker",
    );
  }

  let btcStakingTx: Transaction;
  try {
    btcStakingTx = Transaction.fromHex(stakingTx.txHex);
  } catch (error: unknown) {
    throw StakingError.fromUnknown(
      error, StakingErrorCode.INVALID_INPUT,
      "Invalid staking transaction hex",
    );
  }

  if (!btcStakingTx.outs[stakingTx.stakingOutptuIndex]) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT,
      "Staking transaction output index is out of range",
    );
  }

  if (btcStakingTx.getId() !== delegation.stakingTxHashHex) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT,
      "Staking transaction hash does not match between the btc transaction and the provided staking hash",
    );
  }
  return { btcStakingTx, stakingTx };
}

export const buildScripts = (
  params: ObservableStakingParams,
  finalityProviderPkNoCoordHex: string,
  stakingTxTimelock: number,
  publicKeyHex: string,
): StakingScripts => {
  // Convert covenant PKs to buffers
  let covenantPKsBuffer;
  try {
    covenantPKsBuffer = params?.covenantPks?.map((pk) =>
      getPublicKeyNoCoord(pk),
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
      Buffer.from(publicKeyHex, "hex"),
      [Buffer.from(finalityProviderPkNoCoordHex, "hex")],
      covenantPKsBuffer,
      params.covenantQuorum,
      stakingTxTimelock,
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