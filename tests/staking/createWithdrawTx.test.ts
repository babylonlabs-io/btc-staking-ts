import * as stakingScript from "../../src/staking/stakingScript";
import { testingNetworks } from "../helper";
import * as transaction from "../../src/staking/transactions";
import { getWithdrawTxFee } from "../../src/utils/fee";
import { Psbt } from "bitcoinjs-lib";

describe.each(testingNetworks)("Create withdrawal transactions", ({
  network, networkName, datagen: dataGenerator
}) => {
  const feeRate = 1;
  let stakingTx: any;
  let stakerInfo: any;
  let stakingInstance: any;
  let unbondingTx: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
    jest.restoreAllMocks();

    // Generate new instances for each test
    const generated = dataGenerator.generateRandomStakingTransaction(
      feeRate,
    );
    stakingTx = generated.stakingTx;
    stakerInfo = generated.stakerInfo;
    stakingInstance = generated.stakingInstance;

    const unbondingResult = stakingInstance.createUnbondingTransaction(
      stakingTx,
    );
    unbondingTx = unbondingResult.transaction;
  });

  describe("Create withdraw early unbonded transaction", () => {
    it(`${networkName} should throw an error if fail to build scripts`, () => {
      jest.spyOn(stakingScript, "StakingScriptData").mockImplementation(() => {
        throw new Error("withdraw early unbonded delegation build script error");
      });
      
      expect(() => stakingInstance.createWithdrawEarlyUnbondedPsbt(
        unbondingTx.toHex(),
        feeRate,
      )).toThrow("withdraw early unbonded delegation build script error");
    });

    it(`${networkName} should throw an error if fail to build early unbonded withdraw tx`, () => {
      jest.spyOn(transaction, "withdrawEarlyUnbondedTransaction").mockImplementation(() => {
        throw new Error("fail to build withdraw tx");
      });
      expect(() => stakingInstance.createWithdrawEarlyUnbondedPsbt(
        unbondingTx.toHex(),
        feeRate,
      )).toThrow("fail to build withdraw tx");
    });

    it(`${networkName} should create withdraw early unbonded transaction`, () => {
      const { psbtHex } = stakingInstance.createWithdrawEarlyUnbondedPsbt(
        unbondingTx.toHex(),
        feeRate,
      );

      const psbt = Psbt.fromHex(psbtHex, { network});
      expect(psbt.txInputs.length).toBe(1)
      expect(psbt.txInputs[0].hash.toString("hex")).
        toBe(unbondingTx.getHash().toString("hex"));
      expect(psbt.txInputs[0].index).toBe(0);
      expect(psbt.txOutputs.length).toBe(1);
      const fee = getWithdrawTxFee(feeRate);
      expect(psbt.txOutputs[0].value).toBe(
        unbondingTx.outs[0].value - fee,
      );
      expect(psbt.txOutputs[0].address).toBe(stakerInfo.address);
      expect(psbt.locktime).toBe(0);
      expect(psbt.version).toBe(2);
    });
  });

  describe("Create timelock unbonded transaction", () => {
    it(`${networkName} should throw an error if fail to build scripts`, async () => {
      jest.spyOn(stakingScript, "StakingScriptData").mockImplementation(() => {
        throw new Error("withdraw timelock unbonded delegation build script error");
      });
      expect(() => stakingInstance.createWithdrawStakingExpiredPsbt(
        stakingTx.toHex(),
        feeRate,
      )).toThrow("withdraw timelock unbonded delegation build script error");
    });

    it(`${networkName} should throw an error if fail to build timelock unbonded withdraw tx`, async () => {
      jest.spyOn(transaction, "withdrawTimelockUnbondedTransaction").mockImplementation(() => {
        throw new Error("fail to build withdraw tx");
      });

      expect(() => stakingInstance.createWithdrawStakingExpiredPsbt(
        stakingTx.toHex(),
        feeRate,
      )).toThrow("fail to build withdraw tx");
    });

    it(`${networkName} should create withdraw timelock unbonded transaction`, async () => {
      const { psbtHex } = stakingInstance.createWithdrawStakingExpiredPsbt(
        stakingTx.toHex(),
        feeRate,
      );

      const psbt = Psbt.fromHex(psbtHex, { network });
      expect(psbt.txInputs.length).toBe(1)
      expect(psbt.txInputs[0].hash.toString("hex")).
        toBe(stakingTx.getHash().toString("hex"));
      expect(psbt.txInputs[0].index).toBe(0);
      expect(psbt.txOutputs.length).toBe(1);
      const fee = getWithdrawTxFee(feeRate);
      expect(psbt.txOutputs[0].value).toBe(
        stakingTx.outs[0].value - fee,
      );
      expect(psbt.txOutputs[0].address).toBe(stakerInfo.address);
      expect(psbt.locktime).toBe(0);
      expect(psbt.version).toBe(2);
    });
  });
});

