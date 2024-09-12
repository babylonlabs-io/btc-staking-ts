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
        // Check if address statrts with "tb1p"
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
 * Check whether the given public key is valid.
 *
 * @param {string} publicKeyHex - The public key in hex to check. 
 * It should be public key without the coordinate.
 * @returns {boolean} - True if the public key is valid, otherwise false.
 */
export const isValidNoCordPublicKey = (publicKeyHex: string): boolean => {
  return Buffer.from(publicKeyHex, "hex").length === NO_COORD_PK_BYTE_LENGTH;
}

/**
 * Get the public key without the coordinate.
 * 
 * @param {string} pkHex - The public key in hex.
 * @returns {Buffer} - The public key without the coordinate.
 * If the public key is already 32 bytes, return it as is.
 * Otherwise, return the public key without the first byte.
 */
export const getPublicKeyNoCoord = (pkHex: string): Buffer => {
  const publicKey = Buffer.from(pkHex, "hex");
  // check the length of the public key, if it's already 32 bytes, return it
  if (publicKey.length === 32) {
    return publicKey;
  }
  return publicKey.subarray(1, 33);
};

