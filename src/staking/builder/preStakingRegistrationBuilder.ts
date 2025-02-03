import { UTXO } from "../../types/UTXO";
import { btcstakingtx, btcstakingpop } from "@babylonlabs-io/babylon-proto-ts";
import { StakingErrorCode, StakingError } from "../../error";
import { BABYLON_REGISTRY_TYPE_URLS } from "../../constants/registry";
import { StakingParams, VersionedStakingParams } from "../../types/params";
import { stakingTransaction } from "../transactions";
import { deriveStakingOutputInfo, findMatchingTxOutputIndex } from "../../utils/staking";
import { stakingPsbt } from "../psbt";
import { networks, Transaction } from "bitcoinjs-lib";
import { isTaproot } from "../../utils/btc";
import { StakingBuilder, TransactionResults } from "..";

/**
 * Builder class for pre-staking registration transactions.
 */
export class PreStakingRegistrationBuilder extends StakingBuilder {
  private inputUTXOs?: UTXO[];

  constructor(
    network: networks.Network,
    versionedStakingParams: VersionedStakingParams[],
    babylonBtcTipHeight: number,
  ) {
    super(network, versionedStakingParams, babylonBtcTipHeight);
  }

  /**
   * Sets the UTXOs for the staking transaction.
   * @param utxos - The UTXOs.
   * @returns The builder instance.
   */
  withUTXOs(utxos: UTXO[]): this {
    this.inputUTXOs = utxos;
    return this;
  }

  /**
   * Builds the staking, unbonding, and slashing transactions/psbts for the 
   * pre-staking registration.
   * @param feeRate - The fee rate.
   * @returns An object containing the staking transaction, unbonding transaction, 
   * slashing PSBT, and unbonding slashing PSBT, as well as their fees. The 
   * transactions are hex encoded.
   */
  public buildTransactions(feeRate: number): TransactionResults {
    this.validateRequiredFields();

    const {
      transaction: stakingTx,
      fee: stakingFee
    } = this.createStakingTransaction(
      this.stakingInput!.stakingTimelock,
      this.stakingInput!.stakingAmountSat,
      this.inputUTXOs!,
      feeRate
    );
      
    return {
      stakingResult: {
        transactionHex: stakingTx.toHex(),
        fee: stakingFee,
      },
      // Build the unbonding, slashing, and unbonding slashing transactions/psbts
      // from the existing staking transaction
      ...this.buildTransactionsFromExisting( stakingTx)
    };
  }

  /**
   * Builds the Babylon delegation message for the pre-staking registration.
   * @param unsignedStakingTx - The unsigned staking transaction.
   * @param unsignedUnbondingTx - The unsigned unbonding transaction.
   * @param signedSlashingTx - The signed slashing transaction.
   * @param signedUnbondingSlashingTx - The signed unbonding slashing transaction.
   * @param proofOfPossession - The proof of possession.
   * @returns The delegation message.
   */
  public buildBabylonDelegationMessage(
    unsignedStakingTxHex: string,
    unsignedUnbondingTxHex: string,
    signedSlashingTxHex: string,
    signedUnbondingSlashingTxHex: string,
    proofOfPossession: btcstakingpop.ProofOfPossessionBTC,
  ): {
    typeUrl: BABYLON_REGISTRY_TYPE_URLS.MsgCreateBTCDelegation;
    value: btcstakingtx.MsgCreateBTCDelegation;
  } {
    return this.createDelegationMessage(
      unsignedStakingTxHex,
      unsignedUnbondingTxHex,
      signedSlashingTxHex,
      signedUnbondingSlashingTxHex,
      proofOfPossession
    );
  }

  /**
   * Create a staking psbt hex based on the existing staking transaction.
   * The result is a psbt that can be used to sign the staking transaction and
   * broadcast it to the network.
   * 
   * @param {string} stakingTxHex - The staking transaction hex.
   * @param {UTXO[]} inputUTXOs - The UTXOs to use as inputs for the staking 
   * transaction. The UTXOs that were used to create the staking transaction should
   * be included in this array.
   * @returns {string} - The psbt hex.
   */
  public toStakingPsbt(
    stakingTxHex: string,
    inputUTXOs: UTXO[],
  ): string {
    this.validateRequiredFields();
    const stakingTx = Transaction.fromHex(stakingTxHex);

    // Check the staking output index can be found
    const scripts = this.buildScripts();
    const stakingOutputInfo = deriveStakingOutputInfo(scripts, this.network);
    findMatchingTxOutputIndex(
      stakingTx,
      stakingOutputInfo.outputAddress,
      this.network,
    )
    
    return stakingPsbt(
      stakingTx,
      this.network,
      inputUTXOs,
      isTaproot(
        this.stakerBtcInfo!.address, this.network
      ) ? Buffer.from(this.stakerBtcInfo!.publicKeyNoCoordHex, "hex") : undefined,
    ).toHex();
  }

  /**
   * Validates that all required fields exist in the pre-staking registration 
   * builder. Only checks for existence of fields, not validity.
   * @throws {StakingError} - If any required fields are missing.
   */
  private validateRequiredFields() {
    this.validateCommonFields();
    if (!this.inputUTXOs) throw new StakingError(
      StakingErrorCode.INVALID_INPUT,
      "UTXOs required",
    );
  }

  /**
   * Create a staking transaction for staking.
   * 
   * @param params - The staking parameters.
   * @param stakingTimelock - The staking timelock.
   * @param stakingAmountSat - The amount to stake in satoshis.
   * @param inputUTXOs - The UTXOs to use as inputs for the staking 
   * transaction.
   * @param feeRate - The fee rate for the transaction in satoshis per byte.
   * @returns The staking transaction.
   */
  private createStakingTransaction(
    stakingTimelock: number,
    stakingAmountSat: number,
    inputUTXOs: UTXO[],
    feeRate: number,
  ) {
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
}

/**
 * Validate the staking transaction input data.
 *
 * @param {number} stakingAmountSat - The staking amount in satoshis.
 * @param {number} timelock - The staking time in blocks.
 * @param {StakingParams} params - The staking parameters.
 * @param {UTXO[]} inputUTXOs - The input UTXOs.
 * @param {number} feeRate - The Bitcoin fee rate in sat/vbyte
 * @throws {StakingError} - If the input data is invalid.
 */
const validateStakingTxInputData = (
  stakingAmountSat: number,
  timelock: number,
  params: StakingParams,
  inputUTXOs: UTXO[],
  feeRate: number,
) => {
  if (
    stakingAmountSat < params.minStakingAmountSat ||
    stakingAmountSat > params.maxStakingAmountSat
  ) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT, "Invalid staking amount",
    );
  }

  if (
    timelock < params.minStakingTimeBlocks ||
    timelock > params.maxStakingTimeBlocks
  ) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT, "Invalid timelock",
    );
  }

  if (inputUTXOs.length == 0) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT, "No input UTXOs provided",
    );
  }
  // Sum of inputUTXOs value must be greater than the staking amount
  if (inputUTXOs.reduce((acc, utxo) => acc + utxo.value, 0) <= stakingAmountSat) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT, 
      "Input UTXOs value must be greater than the staking amount to cover fees",
    );
  }
  if (feeRate <= 0) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT, "Invalid fee rate",
    );
  }
}