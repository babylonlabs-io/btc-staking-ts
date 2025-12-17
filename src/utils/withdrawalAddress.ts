import { address as btcAddress, networks, payments } from "bitcoinjs-lib";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";

import { StakingError, StakingErrorCode } from "../error";

export interface AddressValidationResult {
  isValid: boolean;
  invalidAddresses: string[];
}

export function deriveAllowedWithdrawalAddresses(
  publicKeyHex: string,
  network: networks.Network,
): string[] {
  const addresses: string[] = [];
  const publicKeyBuffer = Buffer.from(publicKeyHex, "hex");

  const p2trResult = payments.p2tr({
    internalPubkey: toXOnly(publicKeyBuffer),
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
  }

  return addresses;
}

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

