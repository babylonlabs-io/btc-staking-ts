import { ObservableStaking } from '../../../src/staking/observable';
import { testingNetworks } from '../../helper';


describe.each(testingNetworks)("ObservableStaking input validations", ({
  network, datagen: { observableStakingDatagen: dataGenerator }
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

    const stakingInstance = new ObservableStaking(network, stakerInfo);
    beforeEach(() => {
      jest.restoreAllMocks();
    });

    it('should throw an error if staking transaction start height is less than activation height', () => {
      const invalidDelegation = {
        ...delegation,
        startHeight: params.activationHeight - 1,
      };
  
      expect(() => {
        stakingInstance.validateDelegationInputs(invalidDelegation, params, stakerInfo);
      }).toThrow('Staking transaction start height cannot be less than activation height');
    });
  });

  describe('Observable - validateParams', () => {
    const { publicKey, publicKeyNoCoord} = dataGenerator.generateRandomKeyPair();
    const { address } = dataGenerator.getAddressAndScriptPubKey(
      publicKey,
    ).taproot;
    
    const stakerInfo = {
      address,
      publicKeyNoCoordHex: publicKeyNoCoord,
      publicKeyWithCoord: publicKey,
    };
    const observable = new ObservableStaking(
      network,
      stakerInfo,
    );
    const validParams = dataGenerator.generateStakingParams();

    it('should pass with valid parameters', () => {
      expect(() => observable.validateParams(validParams)).not.toThrow();
    });

    it('should throw an error if no tag', () => {
      const params = { ...validParams, tag: "" };

      expect(() => observable.validateParams(params)).toThrow(
        "Observable staking parameters must include tag" 
      );
    });

    it('should throw an error if no activationHeight', () => {
      const params = { ...validParams, activationHeight: 0 };

      expect(() => observable.validateParams(params)).toThrow(
        "Observable staking parameters must include a positive activation height" 
      );
    });
  });
});