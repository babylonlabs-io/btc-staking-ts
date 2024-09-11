import { Phase1Staking } from "../../src";
import { testingNetworks } from "../helper";
import { Phase1Params } from "../../src/types/params";
import { UTXO } from "../../src/types/UTXO";
import { StakingError, StakingErrorCode } from "../../src/error";
import { BTC_DUST_SAT } from "../../src/constants/dustSat";
import { RBF_SEQUENCE } from "../../src/constants/psbt";

describe("Create staking transaction", () => {
  const { network, networkName, dataGenerator } = testingNetworks[0];

  let stakerInfo: { address: string, publicKeyHex: string, publicKeyWithCoord: string };
  let finalityProviderPublicKey: string;
  let params: Phase1Params;
  let stakingTerm: number;
  let utxos: UTXO[];
  const feeRate = 1;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
    jest.restoreAllMocks();

    const { publicKey, publicKeyNoCoord} = dataGenerator.generateRandomKeyPair();
    const {address, scriptPubKey} = dataGenerator.getAddressAndScriptPubKey(
      publicKey,
    ).taproot;
    
    stakerInfo = {
      address,
      publicKeyHex: publicKeyNoCoord,
      publicKeyWithCoord: publicKey,
    };
    finalityProviderPublicKey = dataGenerator.generateRandomKeyPair().publicKeyNoCoord;
    params = dataGenerator.generateRandomPhase1Params(true);
    stakingTerm = dataGenerator.generateRandomStakingTerm(params);
    utxos = dataGenerator.generateRandomUTXOs(
      params.maxStakingAmountSat * dataGenerator.getRandomIntegerBetween(1, 100),
      dataGenerator.getRandomIntegerBetween(1, 10),
      scriptPubKey,
    );
  });

  it(`${networkName} throw StakingError if stakerInfo is incorrect`, async () => {
    const stakerInfoWithCoordPk = {
      address: stakerInfo.address,
      publicKeyHex: stakerInfo.publicKeyWithCoord,
    };
    expect(() => new Phase1Staking(network, stakerInfoWithCoordPk)).toThrow(
      // Specify the expected error class and message
      new StakingError(StakingErrorCode.SCRIPT_FAILURE, "Invalid staker info")
    );
  });

  it(`${networkName} should throw an error if input data validaiton failed`, async () => {
    jest.spyOn(require("../../src/utils/staking"), "validateStakingTxInputData").mockImplementation(() => {
      throw new StakingError(StakingErrorCode.INVALID_INPUT, "some error");
    });
    const phase1Staking = new Phase1Staking(network, stakerInfo);

    expect(() => phase1Staking.createStakingTransaction(
      params,
      params.minStakingAmountSat,
      stakingTerm,
      finalityProviderPublicKey,
      utxos,
      feeRate,
    )).toThrow(
      new StakingError(StakingErrorCode.INVALID_INPUT, "some error")
    );
  });

  it(`${networkName} should throw an error if fail to build scripts`, async () => {
    jest.spyOn(require("../../src/staking/stakingScript"), "StakingScriptData").mockImplementation(() => {
      throw new StakingError(StakingErrorCode.SCRIPT_FAILURE, "some error");
    });
    const phase1Staking = new Phase1Staking(network, stakerInfo);

    expect(() => phase1Staking.createStakingTransaction(
      params,
      params.minStakingAmountSat,
      stakingTerm,
      finalityProviderPublicKey,
      utxos,
      feeRate,
    )).toThrow(
      new StakingError(StakingErrorCode.SCRIPT_FAILURE, "some error")
    );
  });

  it(`${networkName} should throw an error if fail to build staking tx`, async () => {
    jest.spyOn(require("../../src/staking"), "stakingTransaction").mockImplementation(() => {
      throw new Error("fail to build staking tx");
    });
    const phase1Staking = new Phase1Staking(network, stakerInfo);

    expect(() => phase1Staking.createStakingTransaction(
      params,
      params.minStakingAmountSat,
      stakingTerm,
      finalityProviderPublicKey,
      utxos,
      feeRate,
    )).toThrow(
      new StakingError(StakingErrorCode.BUILD_TRANSACTION_FAILURE, "fail to build staking tx")
    );
  });

  it(`${networkName} should successfully create a staking transaction`, async () => {
    const phase1Staking = new Phase1Staking(network, stakerInfo);
    const amount = dataGenerator.getRandomIntegerBetween(
      params.minStakingAmountSat, params.maxStakingAmountSat,
    );
    const { psbt, fee} = phase1Staking.createStakingTransaction(
      params,
      amount,
      stakingTerm,
      finalityProviderPublicKey,
      utxos,
      feeRate,
    );

    expect(psbt).toBeDefined();
    expect(fee).toBeGreaterThan(0);
    
    // Check the inputs
    expect(psbt.data.inputs.length).toBe(1);
    expect(psbt.data.inputs[0].tapInternalKey?.toString("hex")).toEqual(stakerInfo.publicKeyHex);
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
    expect(psbt.locktime).toBe(params.activationHeight - 1);
    expect(psbt.version).toBe(2);
    psbt.txInputs.map((input) => {
      expect(input.sequence).toBe(RBF_SEQUENCE);
    });
  });
});