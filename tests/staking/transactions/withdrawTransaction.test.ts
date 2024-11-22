import { Network, Transaction, script } from "bitcoinjs-lib";
import {
  initBTCCurve,
  StakingScripts,
  withdrawEarlyUnbondedTransaction,
  withdrawTimelockUnbondedTransaction,
} from "../../../src/index";
import { PsbtResult } from "../../../src/types/transaction";
import { DEFAULT_TEST_FEE_RATE, testingNetworks } from "../../helper";
import { BTC_DUST_SAT } from "../../../src/constants/dustSat";
import { TRANSACTION_VERSION } from "../../../src/constants/psbt";
import { KeyPair, StakingDataGenerator } from "../../helper/datagen/base";
import { ObservableStakingDatagen } from "../../helper/datagen/observable";
import { StakerInfo } from "../../../src/staking";
import { getWithdrawTxFee } from "../../../src/utils/fee";

interface WithdrawTransactionTestData {
  keyPair: KeyPair;
  stakerInfo: StakerInfo;
  stakingScripts: StakingScripts;
  stakingTx: Transaction;
}

const setupTestData = (
    network: Network,
    dataGenerator: ObservableStakingDatagen | StakingDataGenerator,
): WithdrawTransactionTestData => {
  const stakerKeyPair = dataGenerator.generateRandomKeyPair();

  const stakingScripts =
    dataGenerator.generateMockStakingScripts(stakerKeyPair);
  const { stakingTx, stakerInfo } = dataGenerator.generateRandomStakingTransaction(
    network, 1, stakerKeyPair,
  );

  return {
    keyPair: stakerKeyPair,
    stakerInfo,
    stakingScripts,
    stakingTx,
  };
};

// describe.each(testingNetworks)("withdrawTransaction", (
//   { networkName, network, datagen }
// ) => {
describe("withdrawTransaction", () => {
  const { datagen, network, networkName } = testingNetworks[0];
  describe.each(Object.values(datagen))("withdrawTransaction", (
    dataGenerator
  ) => {
    beforeAll(() => {
      initBTCCurve();
    });
    let testData: WithdrawTransactionTestData;

    beforeEach(() => {
      jest.restoreAllMocks();
      testData = setupTestData(
        network,
        dataGenerator,
      );
    });

    it(`${networkName} - should throw an error if the fee rate is less than or equal to 0`, () => {
      expect(() =>
        withdrawEarlyUnbondedTransaction(
          {
            unbondingTimelockScript:
              testData.stakingScripts.unbondingTimelockScript,
            slashingScript: testData.stakingScripts.slashingScript,
          },
          testData.stakingTx,
          testData.stakerInfo.address,
          network,
          0,
        ),
      ).toThrow("Withdrawal feeRate must be bigger than 0");

      expect(() =>
        withdrawTimelockUnbondedTransaction(
          {
            timelockScript: testData.stakingScripts.timelockScript,
            slashingScript: testData.stakingScripts.slashingScript,
            unbondingScript: testData.stakingScripts.unbondingScript,
          },
          testData.stakingTx,
          testData.stakerInfo.address,
          network,
          0,
        ),
      ).toThrow("Withdrawal feeRate must be bigger than 0");

      expect(() =>
        withdrawEarlyUnbondedTransaction(
          {
            unbondingTimelockScript:
              testData.stakingScripts.unbondingTimelockScript,
            slashingScript: testData.stakingScripts.slashingScript,
          },
          testData.stakingTx,
          testData.stakerInfo.address,
          network,
          -1,
        ),
      ).toThrow("Withdrawal feeRate must be bigger than 0");

      expect(() =>
        withdrawTimelockUnbondedTransaction(
          {
            timelockScript: testData.stakingScripts.timelockScript,
            slashingScript: testData.stakingScripts.slashingScript,
            unbondingScript: testData.stakingScripts.unbondingScript,
          },
          testData.stakingTx,
          testData.stakerInfo.address,
          network,
          -1,
        ),
      ).toThrow("Withdrawal feeRate must be bigger than 0");
    });

    it(`${networkName} - should throw an error if the timelock script is not valid`, () => {
      // mock decompile to return null
      jest.spyOn(script, "decompile").mockReturnValue(null);
      expect(() =>
        withdrawTimelockUnbondedTransaction(
          {
            timelockScript: Buffer.alloc(1),
            slashingScript: testData.stakingScripts.slashingScript,
            unbondingScript: testData.stakingScripts.unbondingScript,
          },
          testData.stakingTx,
          testData.stakerInfo.address,
          network,
          DEFAULT_TEST_FEE_RATE,
        ),
      ).toThrow("Timelock script is not valid");
    });

    it(`${networkName} - should throw an error if output index is invalid`, () => {
      expect(() =>
        withdrawTimelockUnbondedTransaction(
          {
            timelockScript: testData.stakingScripts.timelockScript,
            slashingScript: testData.stakingScripts.slashingScript,
            unbondingScript: testData.stakingScripts.unbondingScript,
          },
          testData.stakingTx,
          testData.stakerInfo.address,
          network,
          DEFAULT_TEST_FEE_RATE,
          -1,
        ),
      ).toThrow("Output index must be bigger or equal to 0");
    });

    it(`${networkName} - should throw if not enough funds to cover fees`, () => {
      const { stakingTx, stakerInfo, keyPair, stakingAmountSat } = dataGenerator.generateRandomStakingTransaction(
        network,
      );
      const stakingScripts = dataGenerator.generateMockStakingScripts(keyPair);
      const unitWithdrawTxFee = getWithdrawTxFee(1);
      const feeRateToExceedAmount = Math.ceil(stakingAmountSat / unitWithdrawTxFee) * 10;

      expect(() => withdrawEarlyUnbondedTransaction(
        {
          unbondingTimelockScript:
            stakingScripts.unbondingTimelockScript,
          slashingScript: stakingScripts.slashingScript,
        },
        stakingTx,
        stakerInfo.address,
        network,
        feeRateToExceedAmount,
      )).toThrow("Not enough funds to cover the fee for withdrawal transaction");
    });

    it(`${networkName} - should throw if output is less than dust limit`, () => {
      const params = dataGenerator.generateStakingParams(
        false,
        undefined,
        0,
      );
      const estimatedFee = getWithdrawTxFee(DEFAULT_TEST_FEE_RATE);
      const amountToNotCoverDustLimit = BTC_DUST_SAT + estimatedFee - 1 + params.unbondingFeeSat;
      
      const { stakingTx, stakerInfo, stakingInstance, stakingTxFee } = dataGenerator.generateRandomStakingTransaction(
        network,
        DEFAULT_TEST_FEE_RATE,
        undefined,
        amountToNotCoverDustLimit,
        undefined,
        params,
      );
      const { transaction: unbondingTx } = stakingInstance.createUnbondingTransaction(
        stakingTx,
      );
      expect(() => withdrawEarlyUnbondedTransaction(
        stakingInstance.buildScripts(),
        unbondingTx,
        stakerInfo.address,
        network,
        DEFAULT_TEST_FEE_RATE,
      )).toThrow("Output value is less than dust limit");
    });

    it(`${networkName} - should return a valid psbt result for early unbonded transaction`, () => {
      const psbtResult = withdrawEarlyUnbondedTransaction(
        {
          unbondingTimelockScript:
            testData.stakingScripts.unbondingTimelockScript,
          slashingScript: testData.stakingScripts.slashingScript,
        },
        testData.stakingTx,
        testData.stakerInfo.address,
        network,
        DEFAULT_TEST_FEE_RATE,
      );
      validateCommonFields(psbtResult, testData.stakerInfo.address);
    });

    it(`${networkName} - should return a valid psbt result for timelock unbonded transaction`, () => {
      const psbtResult = withdrawTimelockUnbondedTransaction(
        {
          timelockScript: testData.stakingScripts.timelockScript,
          slashingScript: testData.stakingScripts.slashingScript,
          unbondingScript: testData.stakingScripts.unbondingScript,
        },
        testData.stakingTx,
        testData.stakerInfo.address,
        network,
        DEFAULT_TEST_FEE_RATE,
      );
      validateCommonFields(psbtResult, testData.stakerInfo.address);
    });
  });
});

const validateCommonFields = (
  psbtResult: PsbtResult,
  withdrawalAddress: string,
) => {
  expect(psbtResult).toBeDefined();
  const { psbt, fee } = psbtResult;
  const inputAmount = psbt.data.inputs.reduce(
    (sum, input) => sum + input.witnessUtxo!.value,
    0,
  );
  const outputAmount = psbt.txOutputs.reduce(
    (sum, output) => sum + output.value,
    0,
  );
  expect(inputAmount).toBeGreaterThan(outputAmount);
  expect(inputAmount - outputAmount).toEqual(fee);
  expect(
    psbt.txOutputs.find((output) => output.address === withdrawalAddress),
  ).toBeDefined();

  // validate the psbt version
  expect(psbt.version).toBe(TRANSACTION_VERSION);
  // validate the locktime
  expect(psbt.locktime).toBe(0);
};
