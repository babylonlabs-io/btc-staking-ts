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

// Inclusion proof for a BTC staking transaction that is included in a BTC block
// This is used for post-staking registration on the Babylon chain
// You can refer to https://electrumx.readthedocs.io/en/latest/protocol-methods.html#blockchain-transaction-get-merkle
// for more information on the inclusion proof format.
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
 */
export class PostStakingRegistrationBuilder extends StakingBuilder {
  private existingStakingTx?: Transaction;
  private inclusionProof?: btcstaking.InclusionProof;

  constructor(
    network: networks.Network,
    versionedStakingParams: VersionedStakingParams[],
    existingStakingTxBtcHeight: number,
  ) {
    super(network, versionedStakingParams, existingStakingTxBtcHeight);
  }

  /**
   * Sets the existing staking transaction.
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

  withInclusionProof(proof: btcstaking.InclusionProof): this {
    this.inclusionProof = proof;
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
   * @returns The Babylon delegation message.
   */
  buildBabylonDelegationMessage(
    unsignedUnbondingTxHex: string,
    signedSlashingTxHex: string,
    signedUnbondingSlashingTxHex: string,
    proofOfPossession: btcstakingpop.ProofOfPossessionBTC,
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
      this.inclusionProof
    );
  }

  /**
   * Helper method to build a inclusion proof for the Babylon BTC Staking
   * transaction.
   * @param inclusionProof - The BTC inclusion proof data.
   * @returns The Babylon BTC Staking compatible inclusion proof.
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
    if (!this.existingStakingTx) throw new Error("Existing staking transaction required");
    if (!this.inclusionProof) throw new Error("Inclusion proof required");
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
