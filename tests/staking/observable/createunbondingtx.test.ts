import { Transaction } from "bitcoinjs-lib";
import { ObservableStaking } from "../../../src";
import { internalPubkey } from "../../../src/constants/internalPubkey";
import { StakingError, StakingErrorCode } from "../../../src/error";
import { testingNetworks } from "../../helper";
import { NON_RBF_SEQUENCE } from "../../../src/constants/psbt";
import * as stakingScript from "../../../src/staking/stakingScript";
import * as staking from "../../../src/staking";

describe("Create unbonding transaction", () => {
  const { network, networkName, dataGenerator } = testingNetworks[0];
  const params = dataGenerator.generateRandomObservalbleStakingParams(true);
  const keys = dataGenerator.generateRandomKeyPair();
  const feeRate = 1;
  const stakingAmount = dataGenerator.getRandomIntegerBetween(
    params.minStakingAmountSat, params.maxStakingAmountSat,
  );
  const finalityProviderPkNoCoordHex = dataGenerator.generateRandomKeyPair().publicKeyNoCoord;
  const { stakingTx, stakingTerm} = dataGenerator.generateRandomStakingTransaction(
    keys, feeRate, stakingAmount, "nativeSegwit", params,
  );
  const observableStakingTransaction = {
    txHex: stakingTx.toHex(),
    outputIndex: 0,
    startHeight: dataGenerator.getRandomIntegerBetween(
      params.activationHeight, params.activationHeight + 1000,
    ),
    timelock: stakingTerm,
  }
  const delegation = {
    stakingTxHashHex: Buffer.from(stakingTx.getHash()).reverse().toString('hex'),
    stakerPkHex: keys.publicKeyNoCoord,
    finalityProviderPkNoCoordHex,
    stakingTx: observableStakingTransaction,
  }
  const stakerInfo = {
    address: dataGenerator.getAddressAndScriptPubKey(keys.publicKey).nativeSegwit.address,
    publicKeyNoCoordHex: keys.publicKeyNoCoord,
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
      ...observableStakingTransaction,
      startHeight: invalidStakingTxHeight,
    }
    const invalidDelegation = {
      ...delegation,
      stakingTx: invalidStakingTx,
    }
    const staking = new ObservableStaking(network, stakerInfo);
    expect(() => staking.createUnbondingTransaction(params, invalidDelegation))
      .toThrow("Staking transaction start height cannot be less than activation height");

    // Staking tx timelock is out of range
    const invalidStakingTxTimelock = dataGenerator.getRandomIntegerBetween(
      params.minStakingTimeBlocks - 100, params.minStakingTimeBlocks - 1,
    );
    const invalidStakingTx2 = {
      ...observableStakingTransaction,
      timelock: invalidStakingTxTimelock,
    }
    const invalidDelegation2 = {
      ...delegation,
      stakingTx: invalidStakingTx2,
    }
    expect(() => staking.createUnbondingTransaction(params, invalidDelegation2))
      .toThrow("Staking transaction timelock is out of range");

    // Staker public key does not match
    const invalidStakerPk = dataGenerator.generateRandomKeyPair().publicKeyNoCoord;
    const invalidDelegation3 = {
      ...delegation,
      stakerPkHex: invalidStakerPk,
    }
    expect(() => staking.createUnbondingTransaction(params, invalidDelegation3))
      .toThrow("Staker public key does not match between connected staker and delegation staker");

    // Invalid staking transaction hex
    const invalidStakingTxHex = "invalid";
    const invalidStakingTx3 = {
      ...observableStakingTransaction,
      txHex: invalidStakingTxHex,
    }
    const invalidDelegation4 = {
      ...delegation,
      stakingTx: invalidStakingTx3,
    }
    expect(() => staking.createUnbondingTransaction(params, invalidDelegation4))
      .toThrow("Invalid staking transaction hex");

      // Transaction output index is out of range
    const invalidStakingTx4 = {
      ...observableStakingTransaction,
      outputIndex: dataGenerator.getRandomIntegerBetween(100, 1000),
    }
    const invalidDelegation5 = {
      ...delegation,
      stakingTx: invalidStakingTx4,
    }
    expect(() => staking.createUnbondingTransaction(params, invalidDelegation5))
      .toThrow("Staking transaction output index is out of range");

    // StakingTxHashHex does not match from the staking transaction
    const anotherTx = dataGenerator.generateRandomStakingTransaction(dataGenerator.generateRandomKeyPair())
    const invalidStakingTxHashHex = anotherTx.stakingTx.getHash().toString("hex");
    const invalidDelegation6 = {
      ...delegation,
      stakingTxHashHex: invalidStakingTxHashHex,
    }
    expect(() => staking.createUnbondingTransaction(params, invalidDelegation6))
      .toThrow("Staking transaction hash does not match between the btc transaction and the provided staking hash");
  });


  it(`${networkName} should throw an error if fail to build scripts`, async () => {
    jest.spyOn(stakingScript, "StakingScriptData").mockImplementation(() => {
      throw new StakingError(StakingErrorCode.SCRIPT_FAILURE, "build script error");
    });
    const observableStaking = new ObservableStaking(network, stakerInfo);

    expect(() => observableStaking.createUnbondingTransaction(
      params,
      delegation,
    )).toThrow("build script error");
  });

  it(`${networkName} should throw an error if fail to build unbonding tx`, async () => {
    jest.spyOn(staking, "unbondingTransaction").mockImplementation(() => {
      throw new Error("fail to build unbonding tx");
    });
    const observableStaking = new ObservableStaking(network, stakerInfo);

    expect(() => observableStaking.createUnbondingTransaction(
      params,
      delegation,
    )).toThrow("fail to build unbonding tx");
  });

  it(`${networkName} should successfully create an unbonding transaction`, async () => {
    const observableStaking = new ObservableStaking(network, stakerInfo);
    const { psbt } = observableStaking.createUnbondingTransaction(
      params,
      delegation,
    );
    expect(psbt).toBeDefined();
    const btcTx = Transaction.fromHex(delegation.stakingTx.txHex);

    // Check the psbt inputs
    expect(psbt.txInputs.length).toBe(1);
    expect(psbt.txInputs[0].hash).toEqual(stakingTx.getHash());
    expect(psbt.data.inputs[0].tapInternalKey).toEqual(internalPubkey);
    expect(psbt.data.inputs[0].tapLeafScript?.length).toBe(1);
    expect(psbt.data.inputs[0].witnessUtxo?.value).toEqual(stakingAmount);
    expect(psbt.data.inputs[0].witnessUtxo?.script).toEqual(
      btcTx.outs[observableStakingTransaction.outputIndex].script,
    );
    expect(psbt.txInputs[0].sequence).toEqual(NON_RBF_SEQUENCE);
    expect(psbt.txInputs[0].index).toEqual(observableStakingTransaction.outputIndex);

    // Check the psbt outputs
    expect(psbt.txOutputs.length).toBe(1);
    expect(psbt.txOutputs[0].value).toEqual(stakingAmount - params.unbondingFeeSat);

    // Check the psbt properties
    expect(psbt.locktime).toBe(0);
    expect(psbt.version).toBe(2);
  });

});