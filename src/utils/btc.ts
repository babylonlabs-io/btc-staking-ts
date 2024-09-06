import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib, address as addressChecker, networks } from "bitcoinjs-lib";
import { TAPROOT_ADDRESS_LEN } from "../constants/address";
import { NO_COORD_PK_LENGTH } from "../constants/keys";

// Initialize elliptic curve library
export function initBTCCurve() {
  initEccLib(ecc);
}

/**
 * Check whether the given address is a valid Bitcoin address.
 *
 * @param {string} address - The Bitcoin address to check.
 * @param {object} network - The Bitcoin network (e.g., bitcoin.networks.bitcoin).
 * @returns {boolean} - True if the address is valid, otherwise false.
 */
export const isValidBitcoinAddress = (
  address: string,
  network: networks.Network,
): boolean => {
  try {
    return !!addressChecker.toOutputScript(address, network);
  } catch (error) {
    return false;
  }
};

// TODO: Improve this method to properly check the taproot address format.
/**
 * Check whether the given address is a Taproot address.
 *
 * @param {string} address - The Bitcoin address to check.
 * @returns {boolean} - True if the address is a Taproot address, otherwise false.
 */
export const isTaproot = (address: string): boolean => {
  return address.length === TAPROOT_ADDRESS_LEN;
};

// TODO: Improve this method to properly check the public key format.
/**
 * Check whether the given public key is valid.
 *
 * @param {string} publicKey - The public key to check. 
 * It should be public key without the coordinate.
 * @returns {boolean} - True if the public key is valid, otherwise false.
 */
export const isValidNoCordPublicKey = (publicKey: string): boolean => {
  return publicKey.length === NO_COORD_PK_LENGTH;
}

export const getPublicKeyNoCoord = (pkHex: string): Buffer => {
  const publicKey = Buffer.from(pkHex, "hex");
  // check the length of the public key, if it's already 32 bytes, return it
  if (publicKey.length === 32) {
    return publicKey;
  }
  return publicKey.subarray(1, 33);
};

