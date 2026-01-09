import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { address as btcAddress, networks, payments } from "bitcoinjs-lib";

import { StakingError, StakingErrorCode } from "../error";
import { getPublicKeyNoCoord } from "./btc";

/**
 * Result of validating withdrawal output addresses.
 *
 * @property {boolean} isValid - True if all output scripts belong to the wallet's public key.
 * @property {string[]} invalidAddresses - List of addresses that failed validation.
 */
export interface AddressValidationResult {
  isValid: boolean;
  invalidAddresses: string[];
}

/**
 * Asserts that the provided public key is a valid hex string of the expected length.
 *
 * @param {string} publicKeyHex - The public key in hex format (64 or 66 characters).
 * @throws {StakingError} - Throws with INVALID_INPUT code if the hex string is invalid or has incorrect length.
 */
function assertValidPublicKeyHex(publicKeyHex: string): void {
  const isHex = /^[0-9a-fA-F]+$/.test(publicKeyHex);
  const length = publicKeyHex.length;
  const isValidLength = length === 64 || length === 66;
  if (!isHex || !isValidLength) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT,
      "Invalid public key hex provided for withdrawal address derivation",
    );
  }

  const publicKeyBuffer = Buffer.from(publicKeyHex, "hex");
  const isValidPoint =
    publicKeyBuffer.length === 33
      ? ecc.isPoint(publicKeyBuffer)
      : ecc.isPoint(Buffer.concat([Buffer.from([0x02]), publicKeyBuffer])) ||
        ecc.isPoint(Buffer.concat([Buffer.from([0x03]), publicKeyBuffer]));

  if (!isValidPoint) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT,
      "Invalid public key hex provided for withdrawal address derivation",
    );
  }
}

/**
 * Derives allowed withdrawal addresses from a public key.
 * Always includes a P2TR (Taproot) address. Additionally includes a P2WPKH (Native SegWit)
 * address when the public key is a 33-byte compressed key.
 *
 * @param {string} publicKeyHex - The public key in hex format (32 or 33 bytes).
 * @param {networks.Network} network - The Bitcoin network.
 * @returns {string[]} - Array of derived withdrawal addresses.
 */
export function deriveAllowedWithdrawalAddresses(
  publicKeyHex: string,
  network: networks.Network,
): string[] {
  assertValidPublicKeyHex(publicKeyHex);
  const addresses: string[] = [];
  const publicKeyBuffer = Buffer.from(publicKeyHex, "hex");
  const publicKeyNoCoord = Buffer.from(
    getPublicKeyNoCoord(publicKeyHex),
    "hex",
  );

  const p2trResult = payments.p2tr({
    internalPubkey: publicKeyNoCoord,
    network,
  });
  if (p2trResult.address) {
    addresses.push(p2trResult.address);
  }

  if (publicKeyBuffer.length === 33) {
    const p2wpkhResult = payments.p2wpkh({
      pubkey: publicKeyBuffer,
      network,
    });
    if (p2wpkhResult.address) {
      addresses.push(p2wpkhResult.address);
    }
  } else if (publicKeyBuffer.length === 32) {
    const compressedKeyEven = Buffer.concat([
      Buffer.from([0x02]),
      publicKeyBuffer,
    ]);
    const compressedKeyOdd = Buffer.concat([
      Buffer.from([0x03]),
      publicKeyBuffer,
    ]);

    if (ecc.isPoint(compressedKeyEven)) {
      const p2wpkhEven = payments.p2wpkh({
        pubkey: compressedKeyEven,
        network,
      });
      if (p2wpkhEven.address) {
        addresses.push(p2wpkhEven.address);
      }
    }

    if (ecc.isPoint(compressedKeyOdd)) {
      const p2wpkhOdd = payments.p2wpkh({
        pubkey: compressedKeyOdd,
        network,
      });
      if (p2wpkhOdd.address && !addresses.includes(p2wpkhOdd.address)) {
        addresses.push(p2wpkhOdd.address);
      }
    }
  }

  return addresses;
}

/**
 * Validates that withdrawal output scripts belong to the wallet's public key.
 * An output is valid if its address matches a P2TR or P2WPKH address derived from the public key.
 * Non-address scripts (e.g., OP_RETURN) are automatically skipped during validation.
 *
 * @param {Buffer[]} outputScripts - The output scripts to validate.
 * @param {string} publicKeyHex - The public key in hex format.
 * @param {networks.Network} network - The Bitcoin network.
 * @returns {AddressValidationResult} - The validation result with validity status and any invalid addresses.
 */
export function validateWithdrawalOutputs(
  outputScripts: Buffer[],
  publicKeyHex: string,
  network: networks.Network,
): AddressValidationResult {
  const allowedAddresses = deriveAllowedWithdrawalAddresses(
    publicKeyHex,
    network,
  );

  const invalidAddresses: string[] = [];

  for (const script of outputScripts) {
    let outputAddress: string;
    try {
      outputAddress = btcAddress.fromOutputScript(script, network);
    } catch {
      continue;
    }

    if (!allowedAddresses.includes(outputAddress)) {
      invalidAddresses.push(outputAddress);
    }
  }

  return {
    isValid: invalidAddresses.length === 0,
    invalidAddresses,
  };
}

/**
 * Asserts that all withdrawal output addresses belong to the connected wallet.
 *
 * @param {Buffer[]} outputScripts - The output scripts to validate.
 * @param {string} publicKeyHex - The public key in hex format.
 * @param {networks.Network} network - The Bitcoin network.
 * @throws {StakingError} - Throws with INVALID_OUTPUT code if any output address does not belong to the wallet's public key.
 */
export function assertWithdrawalAddressesValid(
  outputScripts: Buffer[],
  publicKeyHex: string,
  network: networks.Network,
): void {
  const result = validateWithdrawalOutputs(
    outputScripts,
    publicKeyHex,
    network,
  );

  if (!result.isValid) {
    throw new StakingError(
      StakingErrorCode.INVALID_OUTPUT,
      `Withdrawal address validation failed: output addresses [${result.invalidAddresses.join(", ")}] do not belong to the connected wallet's public key`,
    );
  }
}
