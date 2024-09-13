import { StakingScriptData } from '../../../src';
import { buildScripts, validateAndDecodeDelegationInputs } from '../../../src/staking/observable';
import { ObservableStakingParams } from '../../../src/types/params';
import { getPublicKeyNoCoord } from '../../../src/utils/btc';

describe('ObservableStaking input validations', () => {
  const stakerInfo = {
    address: 'bc1p8wsazny8z6l8jv9whagu6zrx43t2lxu9q7xltlp3w44qjja9t3hscc85ux',
    publicKeyNoCoordHex: '2a5b87690d12741e12341e603eed289cacb5e8e0660ac6371816a1ae834418f3',
  };

  const stakingParams: ObservableStakingParams = {
    activationHeight: 1000,
    minStakingTimeBlocks: 100,
    maxStakingTimeBlocks: 10000,
    maxStakingAmountSat: 100000000,
    minStakingAmountSat: 1000000,
    covenantPks: [],
    covenantQuorum: 0,
    unbondingTime: 1000,
    unbondingFeeSat: 1000,
    tag: 'tag',
  };

  const validDelegation = {
    stakingTxHashHex: '5b3950c058137a1a8466eaef274cbac46373d01242cf6f9cf0fb6239c52b070b',
    stakerPkHex: stakerInfo.publicKeyNoCoordHex,
    finalityProviderPkNoCoordHex: '063deb187a4bf11c114cf825a4726e4c2c35fea5c4c44a20ff08a30a752ec7e0',
    stakingTx: {
      txHex: '020000000001028b0558fff11446d093b910172220c8f2ff66b9ecbc8c6ca06780b40b1c02c6460000000000fdffffff97510b2407b07205f137d24b42dabdb991ebb02877cf972c57395a65643375ef0100000000fdffffff0350c3000000000000225120af4bc06f28acd3385adaf413fcc7ff8ac1d27bbc54f9c413c1561276ed40eb980000000000000000496a4762626234002a5b87690d12741e12341e603eed289cacb5e8e0660ac6371816a1ae834418f3063deb187a4bf11c114cf825a4726e4c2c35fea5c4c44a20ff08a30a752ec7e0009698510000000000002251203ba1d14c8716be7930aebf51cd0866ac56af9b85078df5fc31756a094ba55c6f0140378b1d31fdbb2257441b5b135a866f9ffee9c8549b10076356c791ba3906ff339d24ac66b36cee83be1f1072bcf7f7cf6aada1f110b81d87ec2267d60513698c01406e79cf5a6104acd39452fc057e19693a611bad3c420e4c1cfb77c3cfa18003f7f6fae8ce8a16f26008eb17793d09333a60bff991611f07fc1d6aaae90dead854340e0d00',
      outputIndex: 0,
      startHeight: 855890,
      timelock: 150,
    },
  };

  describe('validateAndDecodeDelegationInputs', () => {
    it('should throw an error if staking transaction start height is less than activation height', () => {
      const invalidDelegation = {
        ...validDelegation,
        stakingTx: { ...validDelegation.stakingTx, startHeight: 900 },
      };
  
      expect(() => {
        validateAndDecodeDelegationInputs(invalidDelegation, stakingParams, stakerInfo);
      }).toThrow('Staking transaction start height cannot be less than activation height');
    });
  
    it('should throw an error if the timelock is out of range', () => {
      const invalidDelegation = {
        ...validDelegation,
        stakingTx: { ...validDelegation.stakingTx, timelock: 50 },
      };
  
      expect(() => {
        validateAndDecodeDelegationInputs(invalidDelegation, stakingParams, stakerInfo);
      }).toThrow('Staking transaction timelock is out of range');
    });
  
    it('should throw an error if the staker public key does not match', () => {
      const invalidDelegation = {
        ...validDelegation,
        stakerPkHex: 'invalidpublickey...',
      };
  
      expect(() => {
        validateAndDecodeDelegationInputs(invalidDelegation, stakingParams, stakerInfo);
      }).toThrow('Staker public key does not match between connected staker and delegation staker');
    });
  
    it('should throw an error if the staking transaction hex is invalid', () => {
      const invalidDelegation = {
        ...validDelegation,
        stakingTx: { ...validDelegation.stakingTx, txHex: 'invalidhex' },
      };
  
      expect(() => {
        validateAndDecodeDelegationInputs(invalidDelegation, stakingParams, stakerInfo);
      }).toThrow('Invalid staking transaction hex');
    });
  
    it('should throw an error if the output index is out of range', () => {
      const invalidDelegation = {
        ...validDelegation,
        stakingTx: { ...validDelegation.stakingTx, outputIndex: 100 },
      };
  
      expect(() => {
        validateAndDecodeDelegationInputs(invalidDelegation, stakingParams, stakerInfo);
      }).toThrow('Staking transaction output index is out of range');
  
      jest.restoreAllMocks();
    });
  
    it('should throw an error if the transaction hash does not match', () => {
      const invalidDelegation = {
        ...validDelegation,
        stakingTxHashHex: "d73b09dd0658ee4eb93d33091944e13f5e661c68cdadcdfd3a8302c985e78ee9"
      };
  
      expect(() => {
        validateAndDecodeDelegationInputs(
          invalidDelegation, stakingParams, stakerInfo,
        );
      }).toThrow(
        'Staking transaction hash does not match between the btc transaction and the provided staking hash',
      );
  
      jest.restoreAllMocks();
    });
  
    it('should return the decoded staking transaction when inputs are valid', () => {
      const result = validateAndDecodeDelegationInputs(validDelegation, stakingParams, stakerInfo);
      expect(result.btcStakingTx).toBeDefined();
      expect(result.stakingTx).toEqual(validDelegation.stakingTx);
  
      jest.restoreAllMocks();
    });
  });
});