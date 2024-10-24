import { Staking } from "../../src";
import * as transaction from "../../src/staking/transactions";
import { internalPubkey } from "../../src/constants/internalPubkey";
import { StakingError, StakingErrorCode } from "../../src/error";
import { testingNetworks } from "../helper";
import { NON_RBF_SEQUENCE } from "../../src/constants/psbt";
import * as stakingScript from "../../src/staking/stakingScript";

describe.each(testingNetworks)("Create unbonding transaction", ({
  network, networkName, datagen: { stakingDatagen : dataGenerator }
}) => {
  const params = dataGenerator.generateStakingParams(true);
  const keys = dataGenerator.generateRandomKeyPair();
  const feeRate = 1;
  const stakingAmount = dataGenerator.getRandomIntegerBetween(
    params.minStakingAmountSat, params.maxStakingAmountSat,
  );
  const finalityProviderPkNoCoordHex = dataGenerator.generateRandomKeyPair().publicKeyNoCoord;
  const { stakingTx, timelock} = dataGenerator.generateRandomStakingTransaction(
    keys, feeRate, stakingAmount, "nativeSegwit", params,
  );
  const stakingOutputIndex = 0;
  // const delegation = {
  //   stakingTxHashHex: stakingTx.getId(),
  //   stakerPkNoCoordHex: keys.publicKeyNoCoord,
  //   finalityProviderPkNoCoordHex,
  //   stakingTx,
  //   stakingOutputIndex: 0,
  //   startHeight: dataGenerator.getRandomIntegerBetween(
  //     700000, 800000,
  //   ),
  //   timelock,
  // }
  const stakerInfo = {
    address: dataGenerator.getAddressAndScriptPubKey(keys.publicKey).nativeSegwit.address,
    publicKeyNoCoordHex: keys.publicKeyNoCoord,
    publicKeyWithCoord: keys.publicKey,
  }
  let staking: Staking;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
    jest.restoreAllMocks();
    staking = new Staking(
      network, stakerInfo,
      params, finalityProviderPkNoCoordHex, timelock,
    );
  });

  it(`${networkName} should throw an error if fail to build scripts`, async () => {
    jest.spyOn(stakingScript, "StakingScriptData").mockImplementation(() => {
      throw new StakingError(StakingErrorCode.SCRIPT_FAILURE, "build script error");
    });

    expect(() => staking.createUnbondingTransaction(
      stakingTx, stakingOutputIndex,
    )).toThrow("build script error");
  });

  it(`${networkName} should throw an error if fail to build unbonding tx`, async () => {
    jest.spyOn(transaction, "unbondingTransaction").mockImplementation(() => {
      throw new Error("fail to build unbonding tx");
    });
    expect(() => staking.createUnbondingTransaction(
      stakingTx, stakingOutputIndex,
    )).toThrow("fail to build unbonding tx");
  });

  it(`${networkName} should successfully create an unbonding transaction`, async () => {
    const { psbt } = staking.createUnbondingTransaction(
      stakingTx, stakingOutputIndex,
    );
    expect(psbt).toBeDefined();

    // Check the psbt inputs
    expect(psbt.txInputs.length).toBe(1);
    expect(psbt.txInputs[0].hash).toEqual(stakingTx.getHash());
    expect(psbt.data.inputs[0].tapInternalKey).toEqual(internalPubkey);
    expect(psbt.data.inputs[0].tapLeafScript?.length).toBe(1);
    expect(psbt.data.inputs[0].witnessUtxo?.value).toEqual(stakingAmount);
    expect(psbt.data.inputs[0].witnessUtxo?.script).toEqual(
      stakingTx.outs[stakingOutputIndex].script,
    );
    expect(psbt.txInputs[0].sequence).toEqual(NON_RBF_SEQUENCE);
    expect(psbt.txInputs[0].index).toEqual(stakingOutputIndex);

    // Check the psbt outputs
    expect(psbt.txOutputs.length).toBe(1);
    expect(psbt.txOutputs[0].value).toEqual(stakingAmount - params.unbondingFeeSat);

    // Check the psbt properties
    expect(psbt.locktime).toBe(0);
    expect(psbt.version).toBe(2);
  });
});