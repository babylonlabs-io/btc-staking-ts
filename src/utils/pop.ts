import { sha256 } from "bitcoinjs-lib/src/crypto";

import { STAKING_MODULE_ADDRESS } from "../constants/staking";


export interface UpgradeConfig {
  pop: PopUpgradeConfig;
}

/**
 * Configuration for POP context upgrade
 */
export interface PopUpgradeConfig {
  upgradeBabyHeight: number;
  version: number;
}

/**
 * Creates the context string for the staker POP following RFC-036.
 * See: https://github.com/babylonlabs-io/pm/blob/main/rfc/rfc-036-replay-attack-protection.md
 * @param chainId - The Babylon chain ID
 * @param popContextVersion - The POP context version (defaults to 0)
 * @returns The hex encoded SHA-256 hash of the context string.
 */
export function createStakerPopContext(
  chainId: string,
  popContextVersion: number = 0,
): string {
  const contextString = `btcstaking/${popContextVersion}/staker_pop/${chainId}/${STAKING_MODULE_ADDRESS}`;
  return sha256(Buffer.from(contextString, "utf8")).toString("hex");
}

/**
 * Determines the POP message format based on upgrade configuration and current height.
 * RFC-036: If the Babylon tip height is greater than or equal to the POP context
 * upgrade height, use the new context format.
 * @param currentHeight - The current Babylon tip height
 * @param bech32Address - The staker's bech32 address
 * @param chainId - The Babylon chain ID
 * @param upgradeConfig - Optional upgrade configuration
 * @returns The message to sign (either just the address or context hash + address)
 */
export function getPopMessageToSignFormat(
  currentHeight: number,
  bech32Address: string,
  chainId: string,
  upgradeConfig?: PopUpgradeConfig,
): string {
  // If no upgrade height is configured, use legacy format
  if (!upgradeConfig || upgradeConfig.upgradeBabyHeight === undefined) {
    return bech32Address;
  }

  // RFC-036: If the Babylon tip height is greater than or equal to the POP context
  // upgrade height, use the new context format. See:
  // https://github.com/babylonlabs-io/pm/blob/main/rfc/rfc-036-replay-attack-protection.md
  // (Section: "Handle complexity on Client side")
  // Here, currentHeight refers to the Babylon tip height.
  if (currentHeight >= upgradeConfig.upgradeBabyHeight) {
    const contextHash = createStakerPopContext(chainId, upgradeConfig.version);
    return contextHash + bech32Address;
  }

  // Use legacy format (just the bech32 address)
  return bech32Address;
}

/**
 * Provider interface for fetching Babylon chain information
 */
export interface BabylonPopProvider {
  getCurrentHeight(): Promise<number>;
  getChainId(): Promise<string>;
}

/**
 * Creates the message to sign for proof of possession based on the current
 * Babylon tip height and POP upgrade configuration.
 * This is a standalone, testable version of the POP message creation logic.
 * 
 * @param bech32Address - The staker's bech32 address
 * @param babylonProvider - Provider for fetching Babylon chain information
 * @param upgradeConfig - Optional upgrade configuration
 * @returns The message to sign (either just the address or context hash + address)
 */
export async function createPopMessageToSign(
  bech32Address: string,
  babylonProvider: BabylonPopProvider,
  upgradeConfig?: PopUpgradeConfig,
): Promise<string> {
  // Get current Babylon tip height
  let currentHeight: number;
  try {
    currentHeight = await babylonProvider.getCurrentHeight();
  } catch (error) {
    throw new Error(
      `Failed to get current height for POP context: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Get chain ID for context generation
  let chainId: string;
  try {
    chainId = await babylonProvider.getChainId();
  } catch (error) {
    throw error; // Re-throw as-is to maintain the original error type
  }

  return getPopMessageToSignFormat(currentHeight, bech32Address, chainId, upgradeConfig);
}