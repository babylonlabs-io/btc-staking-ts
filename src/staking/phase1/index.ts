import { networks, Psbt, Transaction } from "bitcoinjs-lib";
import { Phase1Params } from "../../types/params";
import { UTXO } from "../../types/UTXO";
import { StakingScripts } from "../stakingScript";
import { StakingScriptData } from "../stakingScript";
import { StakingError, StakingErrorCode } from "../../error";
import { 
  stakingTransaction, unbondingTransaction,
  withdrawEarlyUnbondedTransaction,
  withdrawTimelockUnbondedTransaction
} from "../.";
import { 
  getPublicKeyNoCoord, isTaproot,
  isValidBitcoinAddress, isValidNoCordPublicKey
} from "../../utils/btc";
import { getStakingTerm, validateStakingTxInputData } from "../../utils/staking";
import { PsbtTransactionResult } from "../../types/transaction";

interface StakerInfo {
  address: string;
  publicKeyHex: string;
}

interface Phase1StakingTransaction {
  txHex: string;
  outputIndex: number;
  startHeight: number;
  timelock: number;
}

interface Phase1Delegation {
  stakingTxHashHex: string;
  stakerPkHex: string;
  finalityProviderPkHex: string;
  stakingTx: Phase1StakingTransaction;
}

/**
 * Phase1Staking is a class that provides methods to create staking transactions
 * for Phase 1 of the Babylon Staking protocol.
 * 
 * The class requires a network and staker information to create staking
 * transactions.
 * The staker information includes the staker's address and 
 * public key(without coordinates).
 * 
 */
export class Phase1Staking {
  private network: networks.Network;
  private stakerInfo: StakerInfo;

  constructor(network: networks.Network, stakerInfo: StakerInfo) {
    this.network = network;
    if (!isValidStakerInfo(stakerInfo)) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT, "Invalid staker info",
      );
    }
    this.stakerInfo = stakerInfo;
  }

  /**
   * Create a staking transaction for Phase 1 of the Babylon Staking protocol.
   * 
   * @param {Phase1Params} params - The staking parameters for Phase 1.
   * @param {number} stakingAmountSat - The amount to stake in satoshis.
   * @param {number} stakingTimeBlocks - The time to stake in blocks.
   * @param {string} finalityProviderPublicKey - The finality provider's public key.
   * @param {UTXO[]} inputUTXOs - The UTXOs to use as inputs for the staking 
   * transaction.
   * @param {number} feeRate - The fee rate for the transaction in satoshis per byte.
   * 
   * @returns {object} - An object containing the unsigned staking transaction
   */
  public createStakingTransaction = (
    params: Phase1Params,
    stakingAmountSat: number,
    stakingTimeBlocks: number,
    finalityProviderPublicKey: string,
    inputUTXOs: UTXO[],
    feeRate: number,
  ): PsbtTransactionResult => {
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
      finalityProviderPublicKey,
      stakingTerm,
      this.stakerInfo.publicKeyHex,
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
        isTaproot(this.stakerInfo.address) ? Buffer.from(this.stakerInfo.publicKeyHex, "hex") : undefined,
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

  public createUnbondingTransaction = (
    stakingParams: Phase1Params,
    delegation: Phase1Delegation,
  ) : {psbt: Psbt } => {
    const {btcStakingTx, stakingTx } = this.validateAndDecodeDelegaitonInputs(
      delegation, stakingParams,
    );  
    // Build scripts
    const scripts = buildScripts(
      stakingParams,
      delegation.finalityProviderPkHex,
      stakingTx.timelock,
      delegation.stakerPkHex,
    );

    // Create the unbonding transaction
    try {
      return unbondingTransaction(
        scripts,
        btcStakingTx,
        stakingParams.unbondingFeeSat,
        this.network,
        stakingTx.outputIndex,
      );
    } catch (error) {
      throw StakingError.fromUnknown(
        error, StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build unsigned unbonding transaction",
      );
    }
  }

  public createWithdrawEarlyUnbondedTransaction = (
    stakingParams: Phase1Params,
    delegation: Phase1Delegation,
    unbondingTx: Transaction,
    feeRate: number,
  ): PsbtTransactionResult => {
    const { stakingTx } = this.validateAndDecodeDelegaitonInputs(
      delegation, stakingParams,
    );
    // Build scripts
    const scripts = buildScripts(
      stakingParams,
      delegation.finalityProviderPkHex,
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

  public createTimelockUnbondedTransaction = (
    stakingParams: Phase1Params,
    delegation: Phase1Delegation,
    feeRate: number,
  ): PsbtTransactionResult => {
    const { stakingTx, btcStakingTx } = this.validateAndDecodeDelegaitonInputs(
      delegation, stakingParams,
    );
    // Build scripts
    const scripts = buildScripts(
      stakingParams,
      delegation.finalityProviderPkHex,
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
        stakingTx.outputIndex,
      );  
    } catch (error) {
      throw StakingError.fromUnknown(
        error, StakingErrorCode.BUILD_TRANSACTION_FAILURE,
        "Cannot build unsigned timelock unbonded transaction",
      );
    }
  }

  validateAndDecodeDelegaitonInputs = (
    delegation: Phase1Delegation, stakingParams: Phase1Params,
  ) => {
    const stakingTx = delegation.stakingTx;
    if (stakingTx.startHeight < stakingParams.activationHeight) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        "Staking transaction start height cannot be less than activation height",
      );
    } else if (
      stakingTx.timelock < stakingParams.minStakingTimeBlocks ||
      stakingTx.timelock > stakingParams.maxStakingTimeBlocks
    ) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        "Staking transaction timelock is out of range",
      );
    } else if (delegation.stakerPkHex !== this.stakerInfo.publicKeyHex) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        "Staker public key does not match between connected staker and delegation staker",
      );
    }
    let btcStakingTx: Transaction;
    try {
      btcStakingTx = Transaction.fromHex(stakingTx.txHex);
    } catch (error) {
      throw StakingError.fromUnknown(
        error, StakingErrorCode.INVALID_INPUT,
        "Invalid staking transaction hex",
      );
    }
    if (!btcStakingTx.outs[stakingTx.outputIndex]) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        "Staking transaction output index is out of range",
      );
    } else if (btcStakingTx.getHash().toString("hex") !== delegation.stakingTxHashHex) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        "Staking transaction hash does not match between the transaction and the provided hash",
      );
    }
    return { btcStakingTx, stakingTx };
  }
}

export const isValidStakerInfo = (stakerInfo: StakerInfo): boolean =>
  isValidBitcoinAddress(stakerInfo.address, networks.bitcoin) &&
  isValidNoCordPublicKey(stakerInfo.publicKeyHex);


const buildScripts = (
  params: Phase1Params,
  finalityProviderPkHex: string,
  stakingTxTimelock: number,
  publicKeyHex: string,
): StakingScripts => {
  // Convert covenant PKs to buffers
  const covenantPKsBuffer = params?.covenantPks?.map((pk) =>
    getPublicKeyNoCoord(pk),
  );

  // Create staking script data
  let stakingScriptData;
  try {
    stakingScriptData = new StakingScriptData(
      Buffer.from(publicKeyHex, "hex"),
      [Buffer.from(finalityProviderPkHex, "hex")],
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