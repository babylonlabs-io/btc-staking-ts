import { MIN_UNBONDING_OUTPUT_VALUE } from "../../../src/constants/unbonding";
import {
  validateParams,
  validateStakingTimelock,
  validateStakingTxInputData,
} from "../../../src/utils/staking";
import { testingNetworks } from "../../helper";

describe.each(testingNetworks)('validateStakingTxInputData', (
  { datagen }
) => {
  describe.each(Object.values(datagen))('validateStakingTxInputData', (
    dataGenerator
  ) => {
    const params = dataGenerator.generateStakingParams();
    const balance = dataGenerator.getRandomIntegerBetween(
      params.maxStakingAmountSat, params.maxStakingAmountSat + 100000000,
    );
    const numberOfUTXOs = dataGenerator.getRandomIntegerBetween(1, 10);
    const validInputUTXOs = dataGenerator.generateRandomUTXOs(
      balance, numberOfUTXOs,
    );
    const feeRate = 1;

    it('should pass with valid staking amount, term, UTXOs, and fee rate', () => {
      expect(() =>
        validateStakingTxInputData(
          params.minStakingAmountSat,
          params.minStakingTimeBlocks,
          params,
          validInputUTXOs,
          feeRate,
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
        )
      ).toThrow('Invalid staking amount');
    });

    it('should throw an error if time lock is less than the minimum', () => {
      expect(() =>
        validateStakingTxInputData(
          params.maxStakingAmountSat,
          params.minStakingTimeBlocks -1 ,
          params,
          validInputUTXOs,
          feeRate,
        )
      ).toThrow('Invalid timelock');
    });

    it('should throw an error if time lock is greater than the maximum', () => {
      expect(() =>
        validateStakingTxInputData(
          params.maxStakingAmountSat,
          params.maxStakingTimeBlocks + 1 ,
          params,
          validInputUTXOs,
          feeRate,
        )
      ).toThrow('Invalid timelock');
    });

    it('should throw an error if no input UTXOs are provided', () => {
      expect(() =>
        validateStakingTxInputData(
          params.maxStakingAmountSat,
          params.maxStakingTimeBlocks,
          params,
          [],
          feeRate,
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
        )
      ).toThrow('Invalid fee rate');
    });
  });
});

describe.each(testingNetworks)('validateParams', (
  { datagen }
) => {
  describe.each(Object.values(datagen))('validateParams', (
    dataGenerator
  ) => {
    const params = dataGenerator.generateStakingParams();

    it('should not throw if params are valid', () => {
      expect(() => validateParams(params)).not.toThrow();
    });

    it('should throw an error if the covenant public keys are not valid', () => {
      expect(() => validateParams({
        ...params, covenantNoCoordPks: ['invalid'],
      })).toThrow('Invalid covenant public keys');
    });

    it('should throw an error if no covenant public keys are provided', () => {
      expect(() => validateParams({
        ...params, covenantNoCoordPks: [],
      })).toThrow('Could not find any covenant public keys');
    });

    it('should throw an error if the covenant quorum is not met', () => {
      expect(() => validateParams({
        ...params, covenantQuorum: params.covenantNoCoordPks.length + 1,
      })).toThrow('Covenant public keys must be greater than or equal to the quorum');
    });

    it('should throw an error if the unbonding time is less than or equal to zero', () => {
      expect(() => validateParams({
        ...params, unbondingTime: 0,
      })).toThrow('Unbonding time must be greater than 0');
    });

    it('should throw an error if the unbonding fee is less than or equal to zero', () => {
      expect(() => validateParams({
        ...params, unbondingFeeSat: 0,
      })).toThrow('Unbonding fee must be greater than 0');
    });

    it('should throw an error if the max staking amount is less than the min staking amount', () => {
      expect(() => validateParams({
        ...params, maxStakingAmountSat: params.minStakingAmountSat - 1,
      })).toThrow('Max staking amount must be greater or equal to min staking amount');
    });

    it('should throw an error if the min staking amount is less than the unbonding fee plus the minimum unbonding output value', () => {
      expect(() => validateParams({
        ...params, minStakingAmountSat: params.unbondingFeeSat + MIN_UNBONDING_OUTPUT_VALUE - 1,
      })).toThrow('Min staking amount must be greater than unbonding fee plus ${MIN_UNBONDING_OUTPUT_VALUE}');
    });

    it('should throw an error if the max staking time is less than the min staking time', () => {
      expect(() => validateParams({
        ...params, maxStakingTimeBlocks: params.minStakingTimeBlocks - 1,
      })).toThrow('Max staking time must be greater or equal to min staking time');
    });

    it('should throw an error if the min staking time is less than or equal to zero', () => {
      expect(() => validateParams({
        ...params, minStakingTimeBlocks: 0,
      })).toThrow('Min staking time must be greater than 0');
    });

    it('should throw an error if the min staking time is less than or equal to zero', () => {
      expect(() => validateParams({
        ...params, minStakingTimeBlocks: 0,
      })).toThrow('Min staking time must be greater than 0');
    });

    it('should throw an error if the slashing rate is less than or equal to zero', () => {
      expect(() => validateParams({
        ...params, slashingRate: 0,
      })).toThrow('Slashing rate must be greater than 0');
    });

    it('should throw if covenant quorum is less than or equal to zero', () => {
      expect(() => validateParams({
        ...params, covenantQuorum: 0,
      })).toThrow('Covenant quorum must be greater than 0');
    });

    it('should throw if slashing public key script is missing', () => {
      expect(() => validateParams({
        ...params, slashingPkScriptHex: '',
      })).toThrow('Slashing public key script is missing');
    });

    it('should throw if minimum slashing transaction fee is less than or equal to zero', () => {
      expect(() => validateParams({
        ...params, minSlashingTxFeeSat: 0,
      })).toThrow('Minimum slashing transaction fee must be greater than 0');
    });
    
    it('should throw if slashing rate is greater than 1', () => { 
      expect(() => validateParams({
        ...params, slashingRate: 1.1,
      })).toThrow('Slashing rate must be less or equal to 1');
    });
  });
});

describe.each(testingNetworks)('validateStakingTimelock', (
  { datagen }
) => {
  describe.each(Object.values(datagen))('validateStakingTimelock', (
    dataGenerator
  ) => {
    const params = dataGenerator.generateStakingParams();

    it('should not throw if timelock is valid', () => {
      expect(() => validateStakingTimelock(params.minStakingTimeBlocks, params)).not.toThrow();
    });

    it('should throw if timelock is less than the min staking time', () => {
      expect(() => validateStakingTimelock(params.minStakingTimeBlocks - 1, params)).toThrow('Staking transaction timelock is out of range');
    });

    it('should throw if timelock is greater than the max staking time', () => {
      expect(() => validateStakingTimelock(params.maxStakingTimeBlocks + 1, params)).toThrow('Staking transaction timelock is out of range');
    });
  });
});
