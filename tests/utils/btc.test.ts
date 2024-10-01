import { isTaproot } from '../../src/utils/btc';
import { networks } from 'bitcoinjs-lib';
import { testingNetworks } from '../helper';

describe('isTaproot', () => {
  describe.each(testingNetworks)('should return true for a valid Taproot address', ({ network, dataGenerator }) => {
    const addresses = dataGenerator.getAddressAndScriptPubKey(
      dataGenerator.generateRandomKeyPair().publicKey
    );
    it('should return true for a valid Taproot address', () => {
      expect(isTaproot(addresses.taproot.address, network)).toBe(true);
    });

    it('should return false for non-Taproot address', () => {
      expect(isTaproot(addresses.nativeSegwit.address, network)).toBe(false);

      const legacyAddress = '16o1TKSUWXy51oDpL5wbPxnezSGWC9rMPv';
      expect(isTaproot(legacyAddress, network)).toBe(false);

      const nestedSegWidth = '3A2yqzgfxwwqxgse5rDTCQ2qmxZhMnfd5b';
      expect(isTaproot(nestedSegWidth, network)).toBe(false);
    });
  });

  const mainnetDatagen = testingNetworks[0]
  const signetDatagen = testingNetworks[1]
  const mainnetAddresses = mainnetDatagen.dataGenerator.getAddressAndScriptPubKey(
    mainnetDatagen.dataGenerator.generateRandomKeyPair().publicKey
  );
  const signetAddresses = signetDatagen.dataGenerator.getAddressAndScriptPubKey(
    signetDatagen.dataGenerator.generateRandomKeyPair().publicKey
  );

  it('should return false for a signet non-Taproot address', () => {
    expect(isTaproot(signetAddresses.nativeSegwit.address, networks.testnet)).toBe(false);

    const legacyAddress = 'n2eq5iP3UsdfmGsJyEEMXyRGNx5ysUXLXb';
    expect(isTaproot(legacyAddress, networks.testnet)).toBe(false);

    const nestedSegWidth = '2NChmRbq92M6geBmwCXcFF8dCfmGr38FmX2';
    expect(isTaproot(nestedSegWidth, networks.testnet)).toBe(false);
  });

  it('should return false for an invalid address format', () => {
    const invalidAddress = 'invalid_address';
    expect(isTaproot(invalidAddress, networks.bitcoin)).toBe(false);
  });

  it('should return false for an incorrect network', () => {
    expect(isTaproot(mainnetAddresses.taproot.address, networks.testnet)).toBe(false);
    expect(isTaproot(mainnetAddresses.taproot.address, networks.regtest)).toBe(false);

    expect(isTaproot(signetAddresses.taproot.address, networks.bitcoin)).toBe(false);
  });
});