import { getStakingTerm, validateParams, validateStakingTxInputData } from "../../../src/utils/staking";


describe('validateParams', () => {
  const validParams = {
    covenantPks: [
      "02a10a06bb3bae360db3aef0326413b55b9e46bf20b9a96fc8a806a99e644fe277",
      "026f13a6d104446520d1757caec13eaf6fbcf29f488c31e0107e7351d4994cd068",
      "02a5e21514682b87e37fb5d3c9862055041d1e6f4cc4f3034ceaf3d90f86b230a6"
    ],
    covenantQuorum: 2,
    unbondingTime: 100,
    unbondingFeeSat: 1000,
    maxStakingAmountSat: 2000,
    minStakingAmountSat: 1000,
    maxStakingTimeBlocks: 500,
    minStakingTimeBlocks: 100,
  };

  it('should pass with valid parameters', () => {
    expect(() => validateParams(validParams)).not.toThrow();
  });

  it('should throw an error if covenant public keys are empty', () => {
    const params = { ...validParams, covenantPks: [] };

    expect(() => validateParams(params)).toThrow(
      'Could not find any covenant public keys'
    );
  });

  it('should throw an error if covenant public keys are less than the quorum', () => {
    const params = { ...validParams, covenantPks: ['abcdef1234567890'], covenantQuorum: 2 };

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

  it('should throw an error if min staking amount is less than 0', () => {
    const params = { ...validParams, minStakingAmountSat: -1 };

    expect(() => validateParams(params)).toThrow(
      'Min staking amount must be greater than 0'
    );
  });

  it('should throw an error if max staking time is less than min staking time', () => {
    const params = { ...validParams, maxStakingTimeBlocks: 50 };

    expect(() => validateParams(params)).toThrow(
      'Max staking time must be greater or equal to min staking time'
    );
  });

  it('should throw an error if min staking time is less than 0', () => {
    const params = { ...validParams, minStakingTimeBlocks: -1 };

    expect(() => validateParams(params)).toThrow(
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

describe('getStakingTerm', () => {
  const params: any = {
    minStakingTimeBlocks: 100,
    maxStakingTimeBlocks: 200,
  };

  it('should return the fixed term when minStakingTimeBlocks equals maxStakingTimeBlocks', () => {
    const fixedParams = { ...params, minStakingTimeBlocks: 150, maxStakingTimeBlocks: 150 };
    const term = 120;
    const result = getStakingTerm(fixedParams, term);
    expect(result).toBe(150);
  });

  it('should return the input term when minStakingTimeBlocks does not equal maxStakingTimeBlocks', () => {
    const inputTerm = 120;
    const result = getStakingTerm(params, inputTerm);
    expect(result).toBe(inputTerm);
  });
});

describe('validateStakingTxInputData', () => {
  const params: any = {
    minStakingAmountSat: 1000,
    maxStakingAmountSat: 1000000,
    minStakingTimeBlocks: 10,
    maxStakingTimeBlocks: 1000,
  };
  const validInputUTXOs: any = [{ txid: 'some-txid', vout: 0, value: 100000 }];

  it('should pass with valid staking amount, term, UTXOs, and fee rate', () => {
    expect(() =>
      validateStakingTxInputData(5000, 50, params, validInputUTXOs, 10)
    ).not.toThrow();
  });

  it('should throw an error if staking amount is less than the minimum', () => {
    expect(() =>
      validateStakingTxInputData(500, 50, params, validInputUTXOs, 10)
    ).toThrow('Invalid staking amount');
  });

  it('should throw an error if staking amount is greater than the maximum', () => {
    expect(() =>
      validateStakingTxInputData(2000000, 50, params, validInputUTXOs, 10)
    ).toThrow('Invalid staking amount');
  });

  it('should throw an error if staking term is less than the minimum', () => {
    expect(() =>
      validateStakingTxInputData(5000, 5, params, validInputUTXOs, 10)
    ).toThrow('Invalid staking term');
  });

  it('should throw an error if staking term is greater than the maximum', () => {
    expect(() =>
      validateStakingTxInputData(5000, 1500, params, validInputUTXOs, 10)
    ).toThrow('Invalid staking term');
  });

  it('should throw an error if no input UTXOs are provided', () => {
    expect(() =>
      validateStakingTxInputData(5000, 50, params, [], 10)
    ).toThrow('No input UTXOs provided');
  });

  it('should throw an error if fee rate is less than or equal to zero', () => {
    expect(() =>
      validateStakingTxInputData(5000, 50, params, validInputUTXOs, 0)
    ).toThrow('Invalid fee rate');
  });
});