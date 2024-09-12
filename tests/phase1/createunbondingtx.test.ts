import { Transaction } from "bitcoinjs-lib";
import { Phase1Staking } from "../../src";
import { internalPubkey } from "../../src/constants/internalPubkey";
import { StakingError, StakingErrorCode } from "../../src/error";
import { testingNetworks } from "../helper";
import { NON_RBF_SEQUENCE } from "../../src/constants/psbt";

describe("Create unbonding transaction", () => {
  const { network, networkName, dataGenerator } = testingNetworks[0];
  const params = dataGenerator.generateRandomPhase1Params(true);
  const keys = dataGenerator.generateRandomKeyPair();
  const feeRate = 1;
  const stakingAmount = dataGenerator.getRandomIntegerBetween(
    params.minStakingAmountSat, params.maxStakingAmountSat,
  );
  const finalityProviderPublicKey = dataGenerator.generateRandomKeyPair().publicKeyNoCoord;
  const { stakingTx, stakingTerm} = dataGenerator.generateRandomStakingTransaction(
    keys, feeRate, stakingAmount, "nativeSegwit", params,
  );
  const phase1StakingTransaction = {
    txHex: stakingTx.toHex(),
    outputIndex: 0,
    startHeight: dataGenerator.getRandomIntegerBetween(
      params.activationHeight, params.activationHeight + 1000,
    ),
    timelock: stakingTerm,
  }
  const phase1Delegation = {
    stakingTxHashHex: Buffer.from(stakingTx.getHash()).reverse().toString('hex'),
    stakerPkHex: keys.publicKeyNoCoord,
    finalityProviderPkHex: finalityProviderPublicKey,
    stakingTx: phase1StakingTransaction,
  }
  const stakerInfo = {
    address: dataGenerator.getAddressAndScriptPubKey(keys.publicKey).nativeSegwit.address,
    publicKeyHex: keys.publicKeyNoCoord,
    publicKeyWithCoord: keys.publicKey,
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
    jest.restoreAllMocks();
  });

  it(`${networkName} should throw an error if delegation input is invalid`, async () => {
    // Staking tx height is less than activation height
    const invalidStakingTxHeight = dataGenerator.getRandomIntegerBetween(0, params.activationHeight);
    const invalidStakingTx = {
      ...phase1StakingTransaction,
      startHeight: invalidStakingTxHeight,
    }
    const invalidDelegation = {
      ...phase1Delegation,
      stakingTx: invalidStakingTx,
    }
    const staking = new Phase1Staking(network, stakerInfo);
    expect(() => staking.createUnbondingTransaction(params, invalidDelegation))
      .toThrow("Staking transaction start height cannot be less than activation height");

    // Staking tx timelock is out of range
    const invalidStakingTxTimelock = dataGenerator.getRandomIntegerBetween(
      params.minStakingTimeBlocks - 100, params.minStakingTimeBlocks - 1,
    );
    const invalidStakingTx2 = {
      ...phase1StakingTransaction,
      timelock: invalidStakingTxTimelock,
    }
    const invalidDelegation2 = {
      ...phase1Delegation,
      stakingTx: invalidStakingTx2,
    }
    expect(() => staking.createUnbondingTransaction(params, invalidDelegation2))
      .toThrow("Staking transaction timelock is out of range");

    // Staker public key does not match
    const invalidStakerPk = dataGenerator.generateRandomKeyPair().publicKeyNoCoord;
    const invalidDelegation3 = {
      ...phase1Delegation,
      stakerPkHex: invalidStakerPk,
    }
    expect(() => staking.createUnbondingTransaction(params, invalidDelegation3))
      .toThrow("Staker public key does not match between connected staker and delegation staker");

    // Invalid staking transaction hex
    const invalidStakingTxHex = "invalid";
    const invalidStakingTx3 = {
      ...phase1StakingTransaction,
      txHex: invalidStakingTxHex,
    }
    const invalidDelegation4 = {
      ...phase1Delegation,
      stakingTx: invalidStakingTx3,
    }
    expect(() => staking.createUnbondingTransaction(params, invalidDelegation4))
      .toThrow("Invalid staking transaction hex");

      // Transaction output index is out of range
    const invalidStakingTx4 = {
      ...phase1StakingTransaction,
      outputIndex: dataGenerator.getRandomIntegerBetween(100, 1000),
    }
    const invalidDelegation5 = {
      ...phase1Delegation,
      stakingTx: invalidStakingTx4,
    }
    expect(() => staking.createUnbondingTransaction(params, invalidDelegation5))
      .toThrow("Staking transaction output index is out of range");

    // StakingTxHashHex does not match from the staking transaction
    const anotherTx = dataGenerator.generateRandomStakingTransaction(dataGenerator.generateRandomKeyPair())
    const invalidStakingTxHashHex = anotherTx.stakingTx.getHash().toString("hex");
    const invalidDelegation6 = {
      ...phase1Delegation,
      stakingTxHashHex: invalidStakingTxHashHex,
    }
    expect(() => staking.createUnbondingTransaction(params, invalidDelegation6))
      .toThrow("Staking transaction hash does not match between the btc transaction and the provided staking hash");
  });


  it(`${networkName} should throw an error if fail to build scripts`, async () => {
    jest.spyOn(require("../../src/staking/stakingScript"), "StakingScriptData").mockImplementation(() => {
      throw new StakingError(StakingErrorCode.SCRIPT_FAILURE, "build script error");
    });
    const phase1Staking = new Phase1Staking(network, stakerInfo);

    expect(() => phase1Staking.createUnbondingTransaction(
      params,
      phase1Delegation,
    )).toThrow("build script error");
  });

  it(`${networkName} should throw an error if fail to build unbonding tx`, async () => {
    jest.spyOn(require("../../src/staking"), "unbondingTransaction").mockImplementation(() => {
      throw new Error("fail to build unbonding tx");
    });
    const phase1Staking = new Phase1Staking(network, stakerInfo);

    expect(() => phase1Staking.createUnbondingTransaction(
      params,
      phase1Delegation,
    )).toThrow("fail to build unbonding tx");
  });

  it(`${networkName} should successfully create an unbonding transaction`, async () => {
    const phase1Staking = new Phase1Staking(network, stakerInfo);
    const { psbt } = phase1Staking.createUnbondingTransaction(
      params,
      phase1Delegation,
    );
    expect(psbt).toBeDefined();
    const btcTx = Transaction.fromHex(phase1Delegation.stakingTx.txHex);

    // Check the psbt inputs
    expect(psbt.txInputs.length).toBe(1);
    expect(psbt.txInputs[0].hash).toEqual(stakingTx.getHash());
    expect(psbt.data.inputs[0].tapInternalKey).toEqual(internalPubkey);
    expect(psbt.data.inputs[0].tapLeafScript?.length).toBe(1);
    expect(psbt.data.inputs[0].witnessUtxo?.value).toEqual(stakingAmount);
    expect(psbt.data.inputs[0].witnessUtxo?.script).toEqual(
      btcTx.outs[phase1StakingTransaction.outputIndex].script,
    );
    expect(psbt.txInputs[0].sequence).toEqual(NON_RBF_SEQUENCE);
    expect(psbt.txInputs[0].index).toEqual(phase1StakingTransaction.outputIndex);

    // Check the psbt outputs
    expect(psbt.txOutputs.length).toBe(1);
    expect(psbt.txOutputs[0].value).toEqual(stakingAmount - params.unbondingFeeSat);

    // Check the psbt properties
    expect(psbt.locktime).toBe(0);
    expect(psbt.version).toBe(2);
  });

});