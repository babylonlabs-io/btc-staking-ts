import { validateParams, validateStakingTxInputData } from "../../../src/utils/staking";
import { testingNetworks } from "../../helper";

describe.each(testingNetworks)('validateParams', (
  { dataGenerator }
) => {
  const validParams = dataGenerator.generateRandomObservableStakingParams();

  it('should pass with valid parameters', () => {
    expect(() => validateParams(validParams)).not.toThrow();
  });

  it('should throw an error if covenant public keys are empty', () => {
    const params = { ...validParams, covenantNoCoordPks: [] };

    expect(() => validateParams(params)).toThrow(
      'Could not find any covenant public keys'
    );
  });

  it('should throw an error if covenant public keys are with coordinates', () => {
    const params = {
      ...validParams, 
      covenantNoCoordPks: validParams.covenantNoCoordPks.map(pk => '02' + pk )
    };

    expect(() => validateParams(params)).toThrow(
      'Covenant public key should contains no coordinate'
    );
  });

  it('should throw an error if covenant public keys are less than the quorum', () => {
    const params = { ...validParams, covenantQuorum: validParams.covenantNoCoordPks.length + 1 };

    expect(() => validateParams(params)).toThrow(
      'Covenant public keys must be greater than or equal to the quorum'
    );
  });

  it('should throw an error if unbonding time is less than or equal to 0', () => {
    const params = { ...validParams, unbondingTime: 0 };

    expect(() => validateParams(params)).toThrow(
      'Unbonding time must be greater than 0'
    );
  });

  it('should throw an error if unbonding fee is less than or equal to 0', () => {
    const params = { ...validParams, unbondingFeeSat: 0 };

    expect(() => validateParams(params)).toThrow(
      'Unbonding fee must be greater than 0'
    );
  });

  it('should throw an error if max staking amount is less than min staking amount', () => {
    const params = { ...validParams, maxStakingAmountSat: 500 };

    expect(() => validateParams(params)).toThrow(
      'Max staking amount must be greater or equal to min staking amount'
    );
  });

  it('should throw an error if min staking amount is less than 1', () => {
    const paramsMinutes = { ...validParams, minStakingAmountSat: -1 };

    expect(() => validateParams(paramsMinutes)).toThrow(
      'Min staking amount must be greater than unbonding fee plus 1000'
    );

    const params0 = { ...validParams, minStakingAmountSat: 0 };

    expect(() => validateParams(params0)).toThrow(
      'Min staking amount must be greater than unbonding fee plus 1000'
    );
  });

  it('should throw an error if max staking time is less than min staking time', () => {
    const params = { ...validParams, maxStakingTimeBlocks: validParams.minStakingTimeBlocks - 1 };

    expect(() => validateParams(params)).toThrow(
      'Max staking time must be greater or equal to min staking time'
    );
  });

  it('should throw an error if min staking time is less than 1', () => {
    const paramsMinutes = { ...validParams, minStakingTimeBlocks: -1 };

    expect(() => validateParams(paramsMinutes)).toThrow(
      'Min staking time must be greater than 0'
    );

    const params0 = { ...validParams, minStakingTimeBlocks: 0 };

    expect(() => validateParams(params0)).toThrow(
      'Min staking time must be greater than 0'
    );
  });

  it('should throw an error if covenant quorum is less than or equal to 0', () => {
    const params = { ...validParams, covenantQuorum: 0 };

    expect(() => validateParams(params)).toThrow(
      'Covenant quorum must be greater than 0'
    );
  });
});

describe.each(testingNetworks)('validateStakingTxInputData', (
  { dataGenerator }
) => {
  const params = dataGenerator.generateRandomObservableStakingParams();
  const balance = dataGenerator.getRandomIntegerBetween(
    params.maxStakingAmountSat, params.maxStakingAmountSat + 100000000,
  );
  const numberOfUTXOs = dataGenerator.getRandomIntegerBetween(1, 10);
  const validInputUTXOs = dataGenerator.generateRandomUTXOs(balance, numberOfUTXOs);
  const { publicKeyNoCoord : finalityProviderPublicKey } = dataGenerator.generateRandomKeyPair();
  const feeRate = 1;

  it('should pass with valid staking amount, term, UTXOs, and fee rate', () => {
    expect(() =>
      validateStakingTxInputData(
        params.minStakingAmountSat,
        params.minStakingTimeBlocks,
        params,
        validInputUTXOs,
        feeRate,
        finalityProviderPublicKey,
      )
    ).not.toThrow();
  });

  it('should throw an error if staking amount is less than the minimum', () => {
    expect(() =>
      validateStakingTxInputData(
        params.minStakingAmountSat -1 ,
        params.minStakingTimeBlocks,
        params,
        validInputUTXOs,
        feeRate,
        finalityProviderPublicKey,
      )
    ).toThrow('Invalid staking amount');
  });

  it('should throw an error if staking amount is greater than the maximum', () => {
    expect(() =>
      validateStakingTxInputData(
        params.maxStakingAmountSat + 1 ,
        params.minStakingTimeBlocks,
        params,
        validInputUTXOs,
        feeRate,
        finalityProviderPublicKey,
      )
    ).toThrow('Invalid staking amount');
  });

  it('should throw an error if staking term is less than the minimum', () => {
    expect(() =>
      validateStakingTxInputData(
        params.maxStakingAmountSat,
        params.minStakingTimeBlocks -1 ,
        params,
        validInputUTXOs,
        feeRate,
        finalityProviderPublicKey,
      )
    ).toThrow('Invalid staking term');
  });

  it('should throw an error if staking term is greater than the maximum', () => {
    expect(() =>
      validateStakingTxInputData(
        params.maxStakingAmountSat,
        params.maxStakingTimeBlocks + 1 ,
        params,
        validInputUTXOs,
        feeRate,
        finalityProviderPublicKey,
      )
    ).toThrow('Invalid staking term');
  });

  it('should throw an error if no input UTXOs are provided', () => {
    expect(() =>
      validateStakingTxInputData(
        params.maxStakingAmountSat,
        params.maxStakingTimeBlocks,
        params,
        [],
        feeRate,
        finalityProviderPublicKey,
      )
    ).toThrow('No input UTXOs provided');
  });

  it('should throw an error if fee rate is less than or equal to zero', () => {
    expect(() =>
      validateStakingTxInputData(
        params.maxStakingAmountSat,
        params.maxStakingTimeBlocks,
        params,
        validInputUTXOs,
        0,
        finalityProviderPublicKey,
      )
    ).toThrow('Invalid fee rate');
  });

  it('should throw an error if finality provider public key contains coordinates', () => {
    const invalidFinalityProviderPublicKey = '02' + finalityProviderPublicKey;

    expect(() =>
      validateStakingTxInputData(
        params.maxStakingAmountSat,
        params.maxStakingTimeBlocks,
        params,
        validInputUTXOs,
        feeRate,
        invalidFinalityProviderPublicKey,
      )
    ).toThrow('Finality provider public key should contains no coordinate');
  });
});