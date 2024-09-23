import { ObservableStaking } from "../../../src";
import { testingNetworks } from "../../helper";
import * as stakingScript from "../../../src/staking/stakingScript";
import * as observableStakingUtils from "../../../src/staking/observable";
import * as staking from "../../../src/staking";

describe("Create withdraw early unbonded transaction", () => {
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
    stakingOutptuIndex: 0,
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
  const observableStaking = new ObservableStaking(network, stakerInfo);
  const unbondingTx = observableStaking.createUnbondingTransaction(
    params,
    delegation,
  ).psbt.signAllInputs(keys.keyPair).finalizeAllInputs().extractTransaction();


  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
    jest.restoreAllMocks();
  });

  describe("Create withdraw early unbonded transaction", () => {
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
      jest.spyOn(observableStakingUtils, "validateAndDecodeDelegationInputs").mockImplementationOnce(() => {
        throw new Error("Fail to validate delegation inputs");
      });
      expect(() => staking.createWithdrawEarlyUnbondedTransaction(
        params, invalidDelegation, unbondingTx, feeRate,
      )).toThrow("Fail to validate delegation inputs");
    });

    it(`${networkName} should throw an error if fail to build scripts`, async () => {
      jest.spyOn(stakingScript, "StakingScriptData").mockImplementation(() => {
        throw new Error("withdraw early unbonded delegation build script error");
      });
      
      const observableStaking = new ObservableStaking(network, stakerInfo);
      expect(() => observableStaking.createWithdrawEarlyUnbondedTransaction(
        params,
        delegation,
        unbondingTx,
        feeRate,
      )).toThrow("withdraw early unbonded delegation build script error");
    });

    it(`${networkName} should throw an error if fail to build early unbonded withdraw tx`, async () => {
      jest.spyOn(staking, "withdrawEarlyUnbondedTransaction").mockImplementation(() => {
        throw new Error("fail to build withdraw tx");
      });
      const observableStaking = new ObservableStaking(network, stakerInfo);

      expect(() => observableStaking.createWithdrawEarlyUnbondedTransaction(
        params,
        delegation,
        unbondingTx,
        feeRate,
      )).toThrow("fail to build withdraw tx");
    });

    it(`${networkName} should create withdraw early unbonded transaction`, async () => {
      const withdrawTx = observableStaking.createWithdrawEarlyUnbondedTransaction(
        params,
        delegation,
        unbondingTx,
        feeRate,
      );
      expect(withdrawTx).toBeDefined();
    });
  });

  describe("Create timelock unbonded transaction", () => {
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
      jest.spyOn(observableStakingUtils, "validateAndDecodeDelegationInputs").mockImplementationOnce(() => {
        throw new Error("Fail to validate delegation inputs");
      });
      expect(() => staking.createWithdrawTimelockUnbondedTransaction(
        params, invalidDelegation, feeRate,
      )).toThrow("Fail to validate delegation inputs");
    });

    it(`${networkName} should throw an error if fail to build scripts`, async () => {
      jest.spyOn(stakingScript, "StakingScriptData").mockImplementation(() => {
        throw new Error("withdraw timelock unbonded delegation build script error");
      });
      const observableStaking = new ObservableStaking(network, stakerInfo);

      expect(() => observableStaking.createWithdrawTimelockUnbondedTransaction(
        params,
        delegation,
        feeRate,
      )).toThrow("withdraw timelock unbonded delegation build script error");
    });

    it(`${networkName} should throw an error if fail to build timelock unbonded withdraw tx`, async () => {
      jest.spyOn(staking, "withdrawTimelockUnbondedTransaction").mockImplementation(() => {
        throw new Error("fail to build withdraw tx");
      });

      const observableStaking = new ObservableStaking(network, stakerInfo);

      expect(() => observableStaking.createWithdrawTimelockUnbondedTransaction(
        params,
        delegation,
        feeRate,
      )).toThrow("fail to build withdraw tx");
    });

    it(`${networkName} should create withdraw timelock unbonded transaction`, async () => {
      const withdrawTx = observableStaking.createWithdrawTimelockUnbondedTransaction(
        params,
        delegation,
        feeRate,
      );
      expect(withdrawTx).toBeDefined();
    });
  });
});

