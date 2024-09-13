import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib, address, networks } from "bitcoinjs-lib";
import { NO_COORD_PK_BYTE_LENGTH } from "../constants/keys";

// Initialize elliptic curve library
export function initBTCCurve() {
  initEccLib(ecc);
}

/**
 * Check whether the given address is a valid Bitcoin address.
 *
 * @param {string} btcAddress - The Bitcoin address to check.
 * @param {object} network - The Bitcoin network (e.g., bitcoin.networks.bitcoin).
 * @returns {boolean} - True if the address is valid, otherwise false.
 */
export const isValidBitcoinAddress = (
  btcAddress: string,
  network: networks.Network,
): boolean => {
  try {
    return !!address.toOutputScript(btcAddress, network);
  } catch (error) {
    return false;
  }
};

/**
 * Check whether the given address is a Taproot address.
 *
 * @param {string} taprootAddress - The Bitcoin address to check.
 * @param {object} network - The Bitcoin network (e.g., bitcoin.networks.bitcoin).
 * @returns {boolean} - True if the address is a Taproot address, otherwise false.
 */
export const isTaproot = (taprootAddress: string, network: networks.Network): boolean => {
  try {
    const decoded = address.fromBech32(taprootAddress);
    if (decoded.version !== 1) {
      return false;
    }
    switch (network) {
      case networks.bitcoin:
        // Check if address statrts with "bc1p"
        return taprootAddress.startsWith("bc1p");
      case networks.testnet:
        // signet, regtest and testnet taproot addresses start with "tb1p" or "sb1p"
        return taprootAddress.startsWith("tb1p") || taprootAddress.startsWith("sb1p");
      default:
        return false;
    }  
  } catch (error) {
    return false;
  }
};

/**
 * Check whether the given public key is a valid public key without a coordinate.
 *
 * @param {string} pkWithNoCoord - public key without the coordinate.  
 * @returns {boolean} - True if the public key without the coordinate is valid, otherwise false.
 */
export const isValidNoCordPublicKey = (pkWithNoCoord: string): boolean => {
  try {
    const keyBuffer = Buffer.from(pkWithNoCoord, 'hex');

    if (keyBuffer.length !== NO_COORD_PK_BYTE_LENGTH) {
      return false;
    }

    // Try both compressed forms: y-coordinate even (0x02) and y-coordinate odd (0x03)
    const compressedKeyEven = Buffer.concat([Buffer.from([0x02]), keyBuffer]);
    const compressedKeyOdd = Buffer.concat([Buffer.from([0x03]), keyBuffer]);

    return (
      ecc.isPoint(compressedKeyEven) || ecc.isPoint(compressedKeyOdd)
    );
  } catch (error) {
    return false;
  }
}

/**
 * Get the public key without the coordinate.
 * 
 * @param {string} pkHex - The public key in hex.
 * @returns {Buffer} - The public key without the coordinate.
 * If the public key is already 32 bytes, return it as is.
 * Otherwise, return the public key without the first byte.
 * @throws {Error} - If the public key is invalid.
 */
export const getPublicKeyNoCoord = (pkHex: string): Buffer => {
  const publicKey = Buffer.from(pkHex, "hex");
  // check the length of the public key, if it's already 32 bytes, return it
  if (publicKey.length === 32) {
    return publicKey;
  }
  return publicKey.subarray(1, 33);  
};

