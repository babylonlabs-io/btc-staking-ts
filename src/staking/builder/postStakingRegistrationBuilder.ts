import { networks, Transaction } from "bitcoinjs-lib";
import { findMatchingTxOutputIndex } from "../../utils/staking";
import { deriveStakingOutputInfo } from "../../utils/staking";
import {
  btccheckpoint,
  btcstaking,
  btcstakingtx,
  btcstakingpop
} from "@babylonlabs-io/babylon-proto-ts";
import { reverseBuffer } from "../../utils";
import { BABYLON_REGISTRY_TYPE_URLS } from "../../constants/registry";
import { VersionedStakingParams } from "../../types";
import { StakingBuilder, TransactionResults } from "..";
import { StakingError } from "../../error";
import { StakingErrorCode } from "../../error";

interface InclusionProof {
  // The 0-based index of the position of the transaction in the ordered list 
  // of transactions in the block.
  pos: number;
  // A list of transaction hashes the current hash is paired with, recursively, 
  // in order to trace up to obtain merkle root of the block, deepest pairing first.
  merkle: string[];
  // The block hash of the block that contains the transaction
  blockHashHex: string;
}

/**
 * Builder class for post-staking registration transactions.
 * This refers to the process of registering a staking on the Babylon
 * chain after the staking transaction has been included in a BTC block.
 */
export class PostStakingRegistrationBuilder extends StakingBuilder {
  private existingStakingTx?: Transaction;

  constructor(
    network: networks.Network,
    versionedStakingParams: VersionedStakingParams[],
    existingStakingTxBtcHeight: number,
  ) {
    super(network, versionedStakingParams, existingStakingTxBtcHeight);
  }

  /**
   * Sets the existing staking transaction that has been included in a BTC block.
   * @param tx - The existing staking transaction.
   * @returns The builder instance.
   */
  withExistingStakingTx(tx: Transaction): this {
    this.existingStakingTx = tx;

    const scripts = this.buildScripts();
    const stakingOutputInfo = deriveStakingOutputInfo(scripts, this.network);
    findMatchingTxOutputIndex(
      this.existingStakingTx!,
      stakingOutputInfo.outputAddress,
      this.network
    );
    return this;
  }

  /**
   * Builds the unbonding and slashing transactions/psbts for the post-staking 
   * registration.
   * @returns An object containing the unbonding transaction, 
   * slashing PSBT, and unbonding slashing PSBT.
   */
  buildTransactions(): Omit<TransactionResults, "stakingResult"> {
    this.validateRequiredFields();

    // Validate existing staking tx matches expected format
    const scripts =this.buildScripts();
    const stakingOutputInfo = deriveStakingOutputInfo(scripts, this.network);
    findMatchingTxOutputIndex(
      this.existingStakingTx!,
      stakingOutputInfo.outputAddress,
      this.network
    );

    return this.buildTransactionsFromExisting(
      this.existingStakingTx!
    );
  }

  /**
   * Builds a Babylon delegation message for the post-staking registration.
   * @param unsignedUnbondingTx - The unsigned unbonding transaction.
   * @param signedSlashingTx - The signed slashing transaction.
   * @param signedUnbondingSlashingTx - The signed unbonding slashing transaction.
   * @param proofOfPossession - The proof of possession.
   * @param inclusionProof - The inclusion proof for the staking transaction.
   * This can be derived from `buildInclusionProof` method.
   * @returns The Babylon delegation message.
   */
  buildBabylonDelegationMessage(
    unsignedUnbondingTxHex: string,
    signedSlashingTxHex: string,
    signedUnbondingSlashingTxHex: string,
    proofOfPossession: btcstakingpop.ProofOfPossessionBTC,
    inclusionProof: btcstaking.InclusionProof,
  ): {
    typeUrl: BABYLON_REGISTRY_TYPE_URLS.MsgCreateBTCDelegation;
    value: btcstakingtx.MsgCreateBTCDelegation;
  } {
    return this.createDelegationMessage(
      this.existingStakingTx!.toHex(),
      unsignedUnbondingTxHex,
      signedSlashingTxHex,
      signedUnbondingSlashingTxHex,
      proofOfPossession,
      inclusionProof,
    );
  }

  /**
   * Builds an inclusion proof for a BTC staking transaction that has been 
   * included in a BTC block. The inclusion proof is required for 
   * post-staking registration on the Babylon chain to verify that the staking 
   * transaction exists in the Bitcoin blockchain.
   * 
   * The proof format follows the Electrum merkle proof specification described 
   * at: https://electrumx.readthedocs.io/en/latest/protocol-methods.html#blockchain-transaction-get-merkle
   * 
   * @param inclusionProof - The BTC inclusion proof data. See `InclusionProof`
   * interface for more details.
   * @returns A Babylon-compatible inclusion proof containing the transaction 
   * position, block hash, and merkle proof bytes
   */
  public buildInclusionProof(
    inclusionProof: InclusionProof,
  ): btcstaking.InclusionProof {
    const {
      pos,
      merkle,
      blockHashHex
    } = inclusionProof;
    const proofHex = deriveMerkleProof(merkle);
  
    const hash = reverseBuffer(Uint8Array.from(Buffer.from(blockHashHex, "hex")));
    const inclusionProofKey: btccheckpoint.TransactionKey =
      btccheckpoint.TransactionKey.fromPartial({
        index: pos,
        hash,
      });
    return btcstaking.InclusionProof.fromPartial({
      key: inclusionProofKey,
      proof: Uint8Array.from(Buffer.from(proofHex, "hex")),
    });
  };

  /**
   * Validates that all required fields exist in the post-staking registration builder.
   * Only checks for existence of fields, not validity.
   * @throws {StakingError} - If any required fields are missing.
   */
  private validateRequiredFields() {
    this.validateCommonFields();
    if (!this.existingStakingTx) throw new StakingError(
      StakingErrorCode.INVALID_INPUT,
      "Existing staking transaction required",
    );
  }
}

/**
 * Derives the merkle proof from the list of hex strings. Note the
 * sibling hashes are reversed from hex before concatenation.
 * @param merkle - The merkle proof hex strings.
 * @returns The merkle proof in hex string format.
 */
const deriveMerkleProof = (merkle: string[]) => {
  const proofHex = merkle.reduce((acc: string, m: string) => {
    return acc + Buffer.from(m, "hex").reverse().toString("hex");
  }, "");
  return proofHex;
};
