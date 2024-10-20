import { networks, payments } from "bitcoinjs-lib";
import { Taptree } from "bitcoinjs-lib/src/types";
import { internalPubkey } from "../../constants/internalPubkey";
import { PsbtOutputExtended } from "../../types/psbtOutputs";
import { StakingError, StakingErrorCode } from "../../error";
import { UTXO } from "../../types/UTXO";
import { isValidNoCoordPublicKey } from "../btc";
import { StakingParams } from "../../types/params";



/**
 * Build the staking output for the transaction which contains p2tr output 
 * with staking scripts.
 * 
 * @param {StakingScripts} scripts - The staking scripts.
 * @param {networks.Network} network - The Bitcoin network.
 * @param {number} amount - The amount to stake.
 * @returns {PsbtOutputExtended[]} - The staking output.
 * @throws {Error} - If the staking output cannot be built.
 */
export const buildStakingOutput = (
  scripts: {
    timelockScript: Buffer;
    unbondingScript: Buffer;
    slashingScript: Buffer;
    dataEmbedScript?: Buffer;
  },
  network: networks.Network,
  amount: number,
) => {
  // Build outputs
  const scriptTree: Taptree = [
    {
      output: scripts.slashingScript,
    },
    [{ output: scripts.unbondingScript }, { output: scripts.timelockScript }],
  ];

  // Create an pay-2-taproot (p2tr) output using the staking script
  const stakingOutput = payments.p2tr({
    internalPubkey,
    scriptTree,
    network,
  });

  if (!stakingOutput.address) {
    throw new StakingError(
      StakingErrorCode.INVALID_OUTPUT,
      "Failed to build staking output",
    );
  }

  const psbtOutputs: PsbtOutputExtended[] = [
    {
      address: stakingOutput.address,
      value: amount,
    },
  ];
  if (scripts.dataEmbedScript) {
    // Add the data embed output to the transaction
    psbtOutputs.push({
      script: scripts.dataEmbedScript,
      value: 0,
    });
  }
  return psbtOutputs;
};

/**
 * Validate the staking transaction input data.
 *
 * @param {number} stakingAmountSat - The staking amount in satoshis.
 * @param {number} timelock - The staking time in blocks.
 * @param {StakingParams} params - The staking parameters.
 * @param {UTXO[]} inputUTXOs - The input UTXOs.
 * @param {number} feeRate - The Bitcoin fee rate in sat/vbyte
 * @throws {StakingError} - If the input data is invalid.
 */
export const validateStakingTxInputData = (
  stakingAmountSat: number,
  timelock: number,
  params: StakingParams,
  inputUTXOs: UTXO[],
  feeRate: number,
  finalityProviderPkNoCoord: string,
) => {
  if (
    stakingAmountSat < params.minStakingAmountSat ||
    stakingAmountSat > params.maxStakingAmountSat
  ) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT, "Invalid staking amount",
    );
  }

  if (
    timelock < params.minStakingTimeBlocks ||
    timelock > params.maxStakingTimeBlocks
  ) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT, "Invalid timelock",
    );
  }

  if (inputUTXOs.length == 0) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT, "No input UTXOs provided",
    );
  }
  if (feeRate <= 0) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT, "Invalid fee rate",
    );
  }
  if (!isValidNoCoordPublicKey(finalityProviderPkNoCoord)) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT, "Finality provider public key should contains no coordinate",
    );
  }
}

export const pksToBuffers = (pks: string[]): Buffer[] => {
  // Convert covenant PKs to buffers
  let buffers;
  try {
    buffers = pks.map((pk) =>
      Buffer.from(pk, "hex")
    );
  } catch (error) {
    throw StakingError.fromUnknown(
      error, StakingErrorCode.INVALID_INPUT,
      "Cannot convert no coordinated public keys to buffers",
    );
  }
  return buffers;
}