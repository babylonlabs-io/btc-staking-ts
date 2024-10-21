import * as stakingScript from "../../src/staking/stakingScript";
import { testingNetworks } from "../helper";
import { StakingParams } from "../../src/types/params";
import { UTXO } from "../../src/types/UTXO";
import { StakingError, StakingErrorCode } from "../../src/error";
import { BTC_DUST_SAT } from "../../src/constants/dustSat";
import { RBF_SEQUENCE } from "../../src/constants/psbt";
import * as stakingUtils from "../../src/utils/staking";
import * as stakingTx from "../../src/staking/transactions";
import { Staking } from "../../src";

describe.each(testingNetworks)("Create staking transaction", ({
  network, networkName, datagen: { stakingDatagen: dataGenerator }
}) => {
  let stakerInfo: { address: string, publicKeyNoCoordHex: string, publicKeyWithCoord: string };
  let finalityProviderPublicKey: string;
  let params: StakingParams;
  let timelock: number;
  let utxos: UTXO[];
  const feeRate = 1;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
    jest.restoreAllMocks();

    const { publicKey, publicKeyNoCoord} = dataGenerator.generateRandomKeyPair();
    const { address, scriptPubKey } = dataGenerator.getAddressAndScriptPubKey(
      publicKey,
    ).taproot;
    
    stakerInfo = {
      address,
      publicKeyNoCoordHex: publicKeyNoCoord,
      publicKeyWithCoord: publicKey,
    };
    finalityProviderPublicKey = dataGenerator.generateRandomKeyPair().publicKeyNoCoord;
    params = dataGenerator.generateStakingParams(true);
    timelock = dataGenerator.generateRandomTimelock(params);
    utxos = dataGenerator.generateRandomUTXOs(
      params.maxStakingAmountSat * dataGenerator.getRandomIntegerBetween(1, 100),
      dataGenerator.getRandomIntegerBetween(1, 10),
      scriptPubKey,
    );
  });

  it(`${networkName} throw StakingError if stakerInfo is incorrect`, async () => {
    const stakerInfoWithCoordPk = {
      address: stakerInfo.address,
      publicKeyNoCoordHex: stakerInfo.publicKeyWithCoord,
    };
    expect(() => new Staking(network, stakerInfoWithCoordPk)).toThrow(
      "Invalid staker public key"
    );

    const stakerInfoWithInvalidAddress = {
      address: "abc",
      publicKeyNoCoordHex: stakerInfo.publicKeyNoCoordHex,
    };
    expect(() => new Staking(network, stakerInfoWithInvalidAddress)).toThrow(
      "Invalid staker bitcoin address"
    );
  });

  it(`${networkName} should throw an error if input data validation failed`, async () => {  
    jest.spyOn(stakingUtils, "validateStakingTxInputData").mockImplementation(() => {
      throw new StakingError(StakingErrorCode.INVALID_INPUT, "some error");
    });
    const staking = new Staking(network, stakerInfo);

    expect(() => staking.createStakingTransaction(
      params,
      params.minStakingAmountSat,
      timelock,
      finalityProviderPublicKey,
      utxos,
      feeRate,
    )).toThrow(
      new StakingError(StakingErrorCode.INVALID_INPUT, "some error")
    );
  });

  it(`${networkName} should throw an error if fail to build scripts`, async () => {
    jest.spyOn(stakingScript, "StakingScriptData").mockImplementation(() => {
      throw new StakingError(StakingErrorCode.SCRIPT_FAILURE, "some error");
    });
    const staking = new Staking(network, stakerInfo);

    expect(() => staking.createStakingTransaction(
      params,
      params.minStakingAmountSat,
      timelock,
      finalityProviderPublicKey,
      utxos,
      feeRate,
    )).toThrow(
      new StakingError(StakingErrorCode.SCRIPT_FAILURE, "some error")
    );
  });

  it(`${networkName} should throw an error if fail to build staking tx`, async () => {
    jest.spyOn(stakingTx, "stakingTransaction").mockImplementation(() => {
      throw new Error("fail to build staking tx");
    });
    const staking = new Staking(network, stakerInfo);

    expect(() => staking.createStakingTransaction(
      params,
      params.minStakingAmountSat,
      timelock,
      finalityProviderPublicKey,
      utxos,
      feeRate,
    )).toThrow(
      new StakingError(StakingErrorCode.BUILD_TRANSACTION_FAILURE, "fail to build staking tx")
    );
  });

  it(`${networkName} should successfully create a staking transaction`, async () => {
    const staking = new Staking(network, stakerInfo);
    const amount = dataGenerator.getRandomIntegerBetween(
      params.minStakingAmountSat, params.maxStakingAmountSat,
    );
    const { psbt, fee} = staking.createStakingTransaction(
      params,
      amount,
      timelock,
      finalityProviderPublicKey,
      utxos,
      feeRate,
    );

    expect(psbt).toBeDefined();
    expect(fee).toBeGreaterThan(0);
    
    // Check the inputs
    expect(psbt.data.inputs.length).toBeGreaterThan(0);
    expect(psbt.data.inputs[0].tapInternalKey?.toString("hex")).toEqual(stakerInfo.publicKeyNoCoordHex);
    expect(psbt.data.inputs[0].witnessUtxo?.script.toString("hex")).toEqual(utxos[0].scriptPubKey);

    // Check the outputs
    expect(psbt.txOutputs.length).toBeGreaterThanOrEqual(1);
    // build the psbt input amount from psbt.data.inputs
    let psbtInputAmount = 0;
    for (let i = 0; i < psbt.data.inputs.length; i++) {
      const newValue = psbt.data.inputs[i].witnessUtxo?.value || 0;
      psbtInputAmount += newValue;
    }
    const changeAmount = psbtInputAmount - amount - fee;
    expect(psbtInputAmount).toBeGreaterThanOrEqual(amount + fee);
    if (changeAmount > BTC_DUST_SAT) {
      expect(psbt.txOutputs[psbt.txOutputs.length - 1].value).toEqual(changeAmount);
      expect(psbt.txOutputs[psbt.txOutputs.length - 1].address).toEqual(stakerInfo.address);
    }
    expect(psbt.txOutputs[0].value).toEqual(amount);

    // Check the psbt properties
    expect(psbt.version).toBe(2);
    psbt.txInputs.map((input) => {
      expect(input.sequence).toBe(RBF_SEQUENCE);
    });
  });
});