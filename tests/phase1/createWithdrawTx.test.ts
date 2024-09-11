import { Phase1Staking } from "../../src";
import { testingNetworks } from "../helper";

describe("Create withdraw early unbonded transaction", () => {
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
    stakingTxHashHex: stakingTx.getHash().toString("hex"),
    stakerPkHex: keys.publicKeyNoCoord,
    finalityProviderPkHex: finalityProviderPublicKey,
    stakingTx: phase1StakingTransaction,
  }
  const stakerInfo = {
    address: dataGenerator.getAddressAndScriptPubKey(keys.publicKey).nativeSegwit.address,
    publicKeyHex: keys.publicKeyNoCoord,
    publicKeyWithCoord: keys.publicKey,
  }
  const phase1Staking = new Phase1Staking(network, stakerInfo);
  const unbondingTx = phase1Staking.createUnbondingTransaction(
    params,
    phase1Delegation,
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
        ...phase1StakingTransaction,
        startHeight: invalidStakingTxHeight,
      }
      const invalidDelegation = {
        ...phase1Delegation,
        stakingTx: invalidStakingTx,
      }
      const staking = new Phase1Staking(network, stakerInfo);
      jest.spyOn(staking, "validateAndDecodeDelegaitonInputs").mockImplementationOnce(() => {
        throw new Error("Fail to validate delegation inputs");
      });
      expect(() => staking.createWithdrawEarlyUnbondedTransaction(
        params, invalidDelegation, unbondingTx, feeRate,
      )).toThrow("Fail to validate delegation inputs");
    });

    it(`${networkName} should throw an error if fail to build scripts`, async () => {
      jest.spyOn(require("../../src/staking/stakingScript"), "StakingScriptData").mockImplementation(() => {
        throw new Error("withdraw early unbonded delegation build script error");
      });
      const phase1Staking = new Phase1Staking(network, stakerInfo);

      expect(() => phase1Staking.createWithdrawEarlyUnbondedTransaction(
        params,
        phase1Delegation,
        unbondingTx,
        feeRate,
      )).toThrow("withdraw early unbonded delegation build script error");
    });

    it(`${networkName} should throw an error if fail to build early unbonded withdraw tx`, async () => {
      jest.spyOn(require("../../src/staking"), "withdrawEarlyUnbondedTransaction").mockImplementation(() => {
        throw new Error("fail to build withdraw tx");
      });
      const phase1Staking = new Phase1Staking(network, stakerInfo);

      expect(() => phase1Staking.createWithdrawEarlyUnbondedTransaction(
        params,
        phase1Delegation,
        unbondingTx,
        feeRate,
      )).toThrow("fail to build withdraw tx");
    });

    it(`${networkName} should create withdraw early unbonded transaction`, async () => {
      const withdrawTx = phase1Staking.createWithdrawEarlyUnbondedTransaction(
        params,
        phase1Delegation,
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
        ...phase1StakingTransaction,
        startHeight: invalidStakingTxHeight,
      }
      const invalidDelegation = {
        ...phase1Delegation,
        stakingTx: invalidStakingTx,
      }
      const staking = new Phase1Staking(network, stakerInfo);
      jest.spyOn(staking, "validateAndDecodeDelegaitonInputs").mockImplementationOnce(() => {
        throw new Error("Fail to validate delegation inputs");
      });
      expect(() => staking.createTimelockUnbondedTransaction(
        params, invalidDelegation, feeRate,
      )).toThrow("Fail to validate delegation inputs");
    });

    it(`${networkName} should throw an error if fail to build scripts`, async () => {
      jest.spyOn(require("../../src/staking/stakingScript"), "StakingScriptData").mockImplementation(() => {
        throw new Error("withdraw timelock unbonded delegation build script error");
      });
      const phase1Staking = new Phase1Staking(network, stakerInfo);

      expect(() => phase1Staking.createTimelockUnbondedTransaction(
        params,
        phase1Delegation,
        feeRate,
      )).toThrow("withdraw timelock unbonded delegation build script error");
    });

    it(`${networkName} should throw an error if fail to build timelock unbonded withdraw tx`, async () => {
      jest.spyOn(require("../../src/staking"), "withdrawTimelockUnbondedTransaction").mockImplementation(() => {
        throw new Error("fail to build withdraw tx");
      });
      const phase1Staking = new Phase1Staking(network, stakerInfo);

      expect(() => phase1Staking.createTimelockUnbondedTransaction(
        params,
        phase1Delegation,
        feeRate,
      )).toThrow("fail to build withdraw tx");
    });

    it(`${networkName} should create withdraw timelock unbonded transaction`, async () => {
      const withdrawTx = phase1Staking.createTimelockUnbondedTransaction(
        params,
        phase1Delegation,
        feeRate,
      );
      expect(withdrawTx).toBeDefined();
    });
  });
});

