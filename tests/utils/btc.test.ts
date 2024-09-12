import { isTaproot } from '../../src/utils/btc';
import { networks } from 'bitcoinjs-lib';

const mainnetTaprootAddress = 'bc1p8wsazny8z6l8jv9whagu6zrx43t2lxu9q7xltlp3w44qjja9t3hscc85ux';
const signetTaprootAddress = 'tb1p2wl2dglg0sqv4r8l7r4uc5av72hyty8zprelfa4kwxw9xhqkv55s3kz7ze';

describe('isTaproot', () => {
  it('should return true for a valid mainnet Taproot address', () => {
    expect(isTaproot(mainnetTaprootAddress, networks.bitcoin)).toBe(true);
  });

  it('should return true for a valid signet Taproot address', () => {
    expect(isTaproot(signetTaprootAddress, networks.testnet)).toBe(true);
  });

  it('should return false for a mainnet non-Taproot address', () => {
    const nativeSegWidthAddress = 'bc1qem92n3xk2rm72mua7jq66m700m3r2ama60mc35';
    expect(isTaproot(nativeSegWidthAddress, networks.bitcoin)).toBe(false);

    const legacyAddress = '16o1TKSUWXy51oDpL5wbPxnezSGWC9rMPv';
    expect(isTaproot(legacyAddress, networks.bitcoin)).toBe(false);

    const nestedSegWidth = '3A2yqzgfxwwqxgse5rDTCQ2qmxZhMnfd5b';
    expect(isTaproot(nestedSegWidth, networks.bitcoin)).toBe(false);
  });

  it('should return false for a signet non-Taproot address', () => {
    const nativeSegWidthAddress = 'tb1qpfctsp5vdsjfg657g8pruka5pp84ye4q9g6u3r';
    expect(isTaproot(nativeSegWidthAddress, networks.testnet)).toBe(false);

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
    expect(isTaproot(mainnetTaprootAddress, networks.testnet)).toBe(false);
    expect(isTaproot(mainnetTaprootAddress, networks.regtest)).toBe(false);

    expect(isTaproot(signetTaprootAddress, networks.bitcoin)).toBe(false);
  });
});