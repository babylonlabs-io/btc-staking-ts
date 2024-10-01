import { validateDelegationInputs } from '../../../src/staking/observable';
import { testingNetworks } from '../../helper';

describe.each(testingNetworks)("ObservableStaking input validations", ({
  dataGenerator
}) => {
  const params = dataGenerator.generateRandomObservableStakingParams(true);
  const keys = dataGenerator.generateRandomKeyPair();
  const feeRate = 1;
  const stakingAmount = dataGenerator.getRandomIntegerBetween(
    params.minStakingAmountSat, params.maxStakingAmountSat,
  );
  const finalityProviderPkNoCoordHex = dataGenerator.generateRandomKeyPair().publicKeyNoCoord;
  const { stakingTx, stakingTerm} = dataGenerator.generateRandomStakingTransaction(
    keys, feeRate, stakingAmount, "nativeSegwit", params,
  );
  const delegation = {
    stakingTxHashHex: stakingTx.getId(),
    stakerPkNoCoordHex: keys.publicKeyNoCoord,
    finalityProviderPkNoCoordHex,
    stakingTx,
    stakingOutputIndex: 0,
    startHeight: dataGenerator.getRandomIntegerBetween(
      params.activationHeight, params.activationHeight + 1000,
    ),
    timelock: stakingTerm,
  }
  const stakerInfo = {
    address: dataGenerator.getAddressAndScriptPubKey(keys.publicKey).nativeSegwit.address,
    publicKeyNoCoordHex: keys.publicKeyNoCoord,
  }

  describe('validateDelegationInputs', () => {
    beforeEach(() => {
      jest.restoreAllMocks();
    });

    it('should throw an error if staking transaction start height is less than activation height', () => {
      const invalidDelegation = {
        ...delegation,
        startHeight: params.activationHeight - 1,
      };
  
      expect(() => {
        validateDelegationInputs(invalidDelegation, params, stakerInfo);
      }).toThrow('Staking transaction start height cannot be less than activation height');
    });
  
    it('should throw an error if the timelock is out of range', () => {
      let invalidDelegation = {
        ...delegation,
        timelock: params.minStakingTimeBlocks - 1,
      };
  
      expect(() => {
        validateDelegationInputs(invalidDelegation, params, stakerInfo);
      }).toThrow('Staking transaction timelock is out of range');

      invalidDelegation = {
        ...delegation,
        timelock: params.maxStakingTimeBlocks + 1,
      };
  
      expect(() => {
        validateDelegationInputs(invalidDelegation, params, stakerInfo);
      }).toThrow('Staking transaction timelock is out of range');
    });
  
    it('should throw an error if the staker public key does not match', () => {
      const invalidDelegation = {
        ...delegation,
        stakerPkNoCoordHex: dataGenerator.generateRandomKeyPair().publicKey
      };
  
      expect(() => {
        validateDelegationInputs(invalidDelegation, params, stakerInfo);
      }).toThrow('Staker public key does not match between connected staker and delegation staker');
    });
  
    it('should throw an error if the output index is out of range', () => {
      const invalidDelegation = {
        ...delegation,
        stakingOutputIndex: delegation.stakingTx.outs.length,
      };
  
      expect(() => {
        validateDelegationInputs(invalidDelegation, params, stakerInfo);
      }).toThrow('Staking transaction output index is out of range');
    });
  
    it('should throw an error if the transaction hash does not match', () => {
      const invalidDelegation = {
        ...delegation,
        stakingTxHashHex: dataGenerator.generateRandomTxId(),
      };
  
      expect(() => {
        validateDelegationInputs(
          invalidDelegation, params, stakerInfo,
        );
      }).toThrow(
        'Staking transaction hash does not match between the btc transaction and the provided staking hash',
      );
    });
  
    it('should validate input is valid', () => {
      expect(() => {
        validateDelegationInputs(delegation, params, stakerInfo);
      }).not.toThrow();
    });
  });
});