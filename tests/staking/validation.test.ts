import { Staking } from '../../src';
import { testingNetworks } from '../helper';

describe.each(testingNetworks)("Staking input validations", ({
  network, datagen: { stakingDatagen: dataGenerator }
}) => {
  describe('validateDelegationInputs', () => {
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
    const delegation = {
      stakingTxHashHex: stakingTx.getId(),
      stakerPkNoCoordHex: keys.publicKeyNoCoord,
      finalityProviderPkNoCoordHex,
      stakingTx,
      stakingOutputIndex: 0,
      startHeight: dataGenerator.getRandomIntegerBetween(700000, 800000),
      timelock,
    }
    const stakerInfo = {
      address: dataGenerator.getAddressAndScriptPubKey(keys.publicKey).nativeSegwit.address,
      publicKeyNoCoordHex: keys.publicKeyNoCoord,
    }

    const stakingInstance = new Staking(network, stakerInfo);
    beforeEach(() => {
      jest.restoreAllMocks();
    });
  
    it('should throw an error if the timelock is out of range', () => {
      let invalidDelegation = {
        ...delegation,
        timelock: params.minStakingTimeBlocks - 1,
      };
  
      expect(() => {
        stakingInstance.validateDelegationInputs(invalidDelegation, params, stakerInfo);
      }).toThrow('Staking transaction timelock is out of range');

      invalidDelegation = {
        ...delegation,
        timelock: params.maxStakingTimeBlocks + 1,
      };
  
      expect(() => {
        stakingInstance.validateDelegationInputs(invalidDelegation, params, stakerInfo);
      }).toThrow('Staking transaction timelock is out of range');
    });
  
    it('should throw an error if the staker public key does not match', () => {
      const invalidDelegation = {
        ...delegation,
        stakerPkNoCoordHex: dataGenerator.generateRandomKeyPair().publicKey
      };
  
      expect(() => {
        stakingInstance.validateDelegationInputs(invalidDelegation, params, stakerInfo);
      }).toThrow('Staker public key does not match between connected staker and delegation staker');
    });
  
    it('should throw an error if the output index is out of range', () => {
      const invalidDelegation = {
        ...delegation,
        stakingOutputIndex: delegation.stakingTx.outs.length,
      };
  
      expect(() => {
        stakingInstance.validateDelegationInputs(invalidDelegation, params, stakerInfo);
      }).toThrow('Staking transaction output index is out of range');
    });
  
    it('should throw an error if the transaction hash does not match', () => {
      const invalidDelegation = {
        ...delegation,
        stakingTxHashHex: dataGenerator.generateRandomTxId(),
      };
  
      expect(() => {
        stakingInstance.validateDelegationInputs(
          invalidDelegation, params, stakerInfo,
        );
      }).toThrow(
        'Staking transaction hash does not match between the btc transaction and the provided staking hash',
      );
    });
  
    it('should validate input is valid', () => {
      expect(() => {
        stakingInstance.validateDelegationInputs(delegation, params, stakerInfo);
      }).not.toThrow();
    });
  });

  describe('validateParams', () => {
    const { publicKey, publicKeyNoCoord} = dataGenerator.generateRandomKeyPair();
    const { address } = dataGenerator.getAddressAndScriptPubKey(
      publicKey,
    ).taproot;
    
    const stakerInfo = {
      address,
      publicKeyNoCoordHex: publicKeyNoCoord,
      publicKeyWithCoord: publicKey,
    };
    const stakingInstance = new Staking(
      network,
      stakerInfo,
    );
    const validParams = dataGenerator.generateStakingParams();

    it('should pass with valid parameters', () => {
      expect(() => stakingInstance.validateParams(validParams)).not.toThrow();
    });

    it('should throw an error if covenant public keys are empty', () => {
      const params = { ...validParams, covenantNoCoordPks: [] };

      expect(() => stakingInstance.validateParams(params)).toThrow(
        'Could not find any covenant public keys'
      );
    });

    it('should throw an error if covenant public keys are with coordinates', () => {
      const params = {
        ...validParams, 
        covenantNoCoordPks: validParams.covenantNoCoordPks.map(pk => '02' + pk )
      };

      expect(() => stakingInstance.validateParams(params)).toThrow(
        'Covenant public key should contains no coordinate'
      );
    });

    it('should throw an error if covenant public keys are less than the quorum', () => {
      const params = { ...validParams, covenantQuorum: validParams.covenantNoCoordPks.length + 1 };

      expect(() => stakingInstance.validateParams(params)).toThrow(
        'Covenant public keys must be greater than or equal to the quorum'
      );
    });

    it('should throw an error if unbonding time is less than or equal to 0', () => {
      const params = { ...validParams, unbondingTime: 0 };

      expect(() => stakingInstance.validateParams(params)).toThrow(
        'Unbonding time must be greater than 0'
      );
    });

    it('should throw an error if unbonding fee is less than or equal to 0', () => {
      const params = { ...validParams, unbondingFeeSat: 0 };

      expect(() => stakingInstance.validateParams(params)).toThrow(
        'Unbonding fee must be greater than 0'
      );
    });

    it('should throw an error if max staking amount is less than min staking amount', () => {
      const params = { ...validParams, maxStakingAmountSat: 500 };

      expect(() => stakingInstance.validateParams(params)).toThrow(
        'Max staking amount must be greater or equal to min staking amount'
      );
    });

    it('should throw an error if min staking amount is less than 1', () => {
      const paramsMinutes = { ...validParams, minStakingAmountSat: -1 };

      expect(() => stakingInstance.validateParams(paramsMinutes)).toThrow(
        'Min staking amount must be greater than unbonding fee plus 1000'
      );

      const params0 = { ...validParams, minStakingAmountSat: 0 };

      expect(() => stakingInstance.validateParams(params0)).toThrow(
        'Min staking amount must be greater than unbonding fee plus 1000'
      );
    });

    it('should throw an error if max staking time is less than min staking time', () => {
      const params = { ...validParams, maxStakingTimeBlocks: validParams.minStakingTimeBlocks - 1 };

      expect(() => stakingInstance.validateParams(params)).toThrow(
        'Max staking time must be greater or equal to min staking time'
      );
    });

    it('should throw an error if min staking time is less than 1', () => {
      const paramsMinutes = { ...validParams, minStakingTimeBlocks: -1 };

      expect(() => stakingInstance.validateParams(paramsMinutes)).toThrow(
        'Min staking time must be greater than 0'
      );

      const params0 = { ...validParams, minStakingTimeBlocks: 0 };

      expect(() => stakingInstance.validateParams(params0)).toThrow(
        'Min staking time must be greater than 0'
      );
    });

    it('should throw an error if covenant quorum is less than or equal to 0', () => {
      const params = { ...validParams, covenantQuorum: 0 };

      expect(() => stakingInstance.validateParams(params)).toThrow(
        'Covenant quorum must be greater than 0'
      );
    });
  });
});

