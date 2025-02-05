import { Transaction } from "bitcoinjs-lib";
import { StakingBuilder } from "../../src/staking";
import { UTXO } from "../../src/types";
import { btcstakingpop, btcstaking } from "@babylonlabs-io/babylon-proto-ts";

// A helper class to test the StakingBuilder class by exposing protected methods
export class TestStakingRegistrationBuilder extends StakingBuilder {
  
  createStakingTransaction(
    inputUTXOs: UTXO[],
    feeRate: number,
  ) {
    return super.createStakingTransaction(inputUTXOs, feeRate);
  }

  createUnbondingTransaction(
    stakingTx: Transaction,
  ) {
    return super.createUnbondingTransaction(stakingTx);
  }

  createStakingOutputSlashingPsbt(
    stakingTx: Transaction,
  ) {
    return super.createStakingOutputSlashingPsbt(stakingTx);
  }

  createUnbondingOutputSlashingPsbt(
    unbondingTx: Transaction,
  ) {
    return super.createUnbondingOutputSlashingPsbt(unbondingTx);
  }

  validateCommonFields() {
    return super.validateCommonFields();
  }

  buildTransactionsFromExisting(
    stakingTx: Transaction,
  ) {
    return super.buildTransactionsFromExisting(stakingTx);
  }
  
  createDelegationMessage(
    unsignedStakingTxHex: string,
    unsignedUnbondingTxHex: string,
    signedSlashingTxHex: string,
    signedUnbondingSlashingTxHex: string,
    proofOfPossession: btcstakingpop.ProofOfPossessionBTC,
    inclusionProof?: btcstaking.InclusionProof,
  ) {
    return super.createDelegationMessage(
      unsignedStakingTxHex,
      unsignedUnbondingTxHex,
      signedSlashingTxHex,
      signedUnbondingSlashingTxHex,
      proofOfPossession,
      inclusionProof,
    );
  }
}