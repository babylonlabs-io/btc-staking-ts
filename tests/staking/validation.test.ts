import * as utils from '../../src/utils/staking';
import { testingNetworks } from '../helper';
import { StakingBuilder } from "../../src/staking";

describe.each(testingNetworks)("Staking input validations", ({
  network, datagen: dataGenerator
}) => {
  describe('validateStakingInput', () => {
    const feeRate = 1;
    const {
      stakingTx, finalityProviderPkNoCoordHex,
      stakingInstance, params, 
    } = dataGenerator.generateRandomStakingTransaction(network, feeRate);
    
    beforeEach(() => {
      jest.restoreAllMocks();
    });
  
    it('should throw an error if the timelock is out of range', () => {
      expect(() => {
        stakingInstance.withStakingInput({
          stakingAmountSat: 1000000,
          stakingTimelock: params.minStakingTimeBlocks - 1,
          finalityProviderPkNoCoordHex,
        });
      }).toThrow('Staking transaction timelock is out of range');

      expect(() => {
        stakingInstance.withStakingInput({
          stakingAmountSat: 1000000,
          stakingTimelock: params.maxStakingTimeBlocks + 1,
          finalityProviderPkNoCoordHex,
        });
      }).toThrow('Staking transaction timelock is out of range');
    });
  
    it('should throw an error if the output index is out of range', () => {
      jest.spyOn(utils, "findMatchingTxOutputIndex").mockImplementation(() => {
        throw new Error('Staking transaction output index is out of range');
      });
      expect(() => {
        stakingInstance.createWithdrawStakingExpiredPsbt(
          stakingTx.toHex(), feeRate,
        );
      }).toThrow('Staking transaction output index is out of range');

      expect(() => {
        stakingInstance.createUnbondingTransaction(
          stakingTx
        );
      }).toThrow('Staking transaction output index is out of range');
    });
  });

  describe('validateParams', () => {
    const validParams = dataGenerator.generateStakingParams();

    it('should pass with valid parameters', () => {
      expect(() => new StakingBuilder(
        network,
        [validParams],
        validParams.btcActivationHeight + 1,
      )).not.toThrow();
    });

    it('should pass with valid parameters without slashing', () => {
      const paramsWithoutSlashing = { ...validParams, slashing: undefined };
      expect(() => new StakingBuilder(
        network,
        [paramsWithoutSlashing],
        validParams.btcActivationHeight + 1,
      )).not.toThrow();
    });

    it('should throw if an error from validateParams is thrown', () => {
      jest.spyOn(utils, "validateParams").mockImplementation(() => {
        throw new Error('Invalid parameters');
      });
      expect(() => new StakingBuilder(
        network,
        [validParams],
        validParams.btcActivationHeight + 1,
      )).toThrow('Invalid parameters');
    });
  });
});
