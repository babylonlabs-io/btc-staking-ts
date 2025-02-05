import { UTXO } from "../../types/UTXO";
import { btcstakingtx, btcstakingpop } from "@babylonlabs-io/babylon-proto-ts";
import { StakingErrorCode, StakingError } from "../../error";
import { BABYLON_REGISTRY_TYPE_URLS } from "../../constants/registry";
import { VersionedStakingParams } from "../../types/params";
import { deriveStakingOutputInfo, findMatchingTxOutputIndex } from "../../utils/staking";
import { stakingPsbt } from "../psbt";
import { networks, Transaction } from "bitcoinjs-lib";
import { isTaproot } from "../../utils/btc";
import { StakingBuilder, TransactionResults } from "..";

/**
 * Builder class for pre-staking registration transactions.
 * This refers to the process of registering a staking on the Babylon
 * chain before the staking transaction has been included in a BTC block.
 */
export class PreStakingRegistrationBuilder extends StakingBuilder {
  private inputUTXOs?: UTXO[];

  constructor(
    network: networks.Network,
    versionedStakingParams: VersionedStakingParams[],
    // The height of BTC tip block on the Babylon chain. This value should be
    // obtained from the Babylon chain.
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
  buildTransactions(feeRate: number): TransactionResults {
    this.validateRequiredFields();

    const {
      transaction: stakingTx,
      fee: stakingFee
    } = this.createStakingTransaction(
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
  buildBabylonDelegationMessage(
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
}