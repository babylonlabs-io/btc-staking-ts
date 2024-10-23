import { ObservableStakingParams } from "../../types/params";
import { UTXO } from "../../types/UTXO";
import { StakingError, StakingErrorCode } from "../../error";
import { stakingTransaction } from "../transactions";
import { isTaproot } from "../../utils/btc";
import { toBuffers, validateStakingTxInputData } from "../../utils/staking";
import { PsbtTransactionResult } from "../../types/transaction";
import { ObservableStakingScriptData, ObservableStakingScripts } from "./observableStakingScript";
import { Delegation, StakerInfo, Staking } from "..";
export * from "./observableStakingScript";

/**
 * ObservableStaking is a class that provides an interface to create observable
 * staking transactions for the Babylon Staking protocol.
 * 
 * The class requires a network and staker information to create staking
 * transactions.
 * The staker information includes the staker's address and 
 * public key(without coordinates).
 */
export class ObservableStaking extends Staking {
  /**
   * validateParams validates the staking parameters for observable staking.
   * 
   * @param {ObservableStakingParams} params - The staking parameters for observable staking.
   * 
   * @throws {StakingError} - If the staking parameters are invalid
   */
  validateParams(params: ObservableStakingParams): void {
    super.validateParams(params);
    if (!params.tag) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT, 
        "Observable staking parameters must include tag",
      );
    }
    if (!params.activationHeight) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        "Observable staking parameters must include a positive activation height",
      );
    }
  }

  /**
   * Validate the delegation inputs for observable staking.
   * This method overwrites the base method to include the start height validation.
   * 
   * @param {Delegation} delegation - The delegation to validate.
   * @param {ObservableStakingParams} stakingParams - The staking parameters.
   * @param {StakerInfo} stakerInfo - The staker information.
   * 
   * @throws {StakingError} - If the delegation inputs are invalid.
   */
  validateDelegationInputs(
    delegation: Delegation,
    stakingParams: ObservableStakingParams,
    stakerInfo: StakerInfo,
  ) {
    super.validateDelegationInputs(delegation, stakingParams, stakerInfo);
    if (delegation.startHeight < stakingParams.activationHeight) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        "Staking transaction start height cannot be less than activation height",
      );
    }
  }

  /**
   * Build the staking scripts for observable staking.
   * This method overwrites the base method to include the OP_RETURN tag based 
   * on the tag provided in the parameters.
   * 
   * @param {ObservableStakingParams} params - The staking parameters for observable staking.
   * @param {string} finalityProviderPkNoCoordHex - The finality provider's public key
   * without coordinates.
   * @param {number} timelock - The staking time in blocks.
   * @param {string} stakerPkNoCoordHex - The staker's public key without coordinates.
   * 
   * @returns {ObservableStakingScripts} - The staking scripts for observable staking.
   * 
   * @throws {StakingError} - If the scripts cannot be built.
   */
  buildScripts(
    params: ObservableStakingParams,
    finalityProviderPkNoCoordHex: string,
    timelock: number,
    stakerPkNoCoordHex: string,
  ): ObservableStakingScripts {
    // Create staking script data
    let stakingScriptData;
    try {
      stakingScriptData = new ObservableStakingScriptData(
        Buffer.from(stakerPkNoCoordHex, "hex"),
        [Buffer.from(finalityProviderPkNoCoordHex, "hex")],
        toBuffers(params.covenantNoCoordPks),
        params.covenantQuorum,
        timelock,
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
  }

  /**
   * Create a staking transaction for observable staking.
   * This overwrites the method from the Staking class with the addtion
   * of the 
   * 1. OP_RETURN tag in the staking scripts
   * 2. lockHeight parameter
   * 
   * @param {ObservableStakingParams} params - The staking parameters for observable staking.
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
  public createStakingTransaction(
    params: ObservableStakingParams,
    stakingAmountSat: number,
    timelock: number,
    finalityProviderPkNoCoord: string,
    inputUTXOs: UTXO[],
    feeRate: number,
  ): PsbtTransactionResult{
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
}