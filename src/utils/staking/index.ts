import { networks, payments } from "bitcoinjs-lib";
import { Taptree } from "bitcoinjs-lib/src/types";
import { internalPubkey } from "../../constants/internalPubkey";
import { PsbtOutputExtended } from "../../types/psbtOutputs";
import { Params } from "../../types/params";
import { StakingError, StakingErrorCode } from "../../error";
import { UTXO } from "../../types/UTXO";

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
 * Get the staking term, it will ignore the `stakingTimeBlocks` and
 * use the value from params if the min and max staking time blocks are the same
 *
 * @param {Params} params - The staking parameters.
 * @param {number} term - The staking term.
 * @returns {number} - The staking term.
 */
export const getStakingTerm = (params: Params, term: number) => {
  // check if term is fixed
  let termWithFixed;
  if (params.minStakingTimeBlocks === params.maxStakingTimeBlocks) {
    // if term is fixed, use the API value
    termWithFixed = params.minStakingTimeBlocks;
  } else {
    // if term is not fixed, use the term from the input
    termWithFixed = term;
  }
  return termWithFixed;
};

/**
 * Validate the staking transaction input data.
 *
 * @param {number} stakingAmountSat - The staking amount in satoshis.
 * @param {number} stakingTerm - The staking term in blocks.
 * @param {Params} params - The staking parameters.
 * @param {UTXO[]} inputUTXOs - The input UTXOs.
 * @param {number} feeRate - The Bitcoin fee rate in sat/vbyte
 * @throws {StakingError} - If the input data is invalid.
 */
export const validateStakingTxInputData = (
  stakingAmountSat: number,
  stakingTerm: number,
  params: Params,
  inputUTXOs: UTXO[],
  feeRate: number,
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
    stakingTerm < params.minStakingTimeBlocks ||
    stakingTerm > params.maxStakingTimeBlocks
  ) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT, "Invalid staking term",
    );
  }

  if (inputUTXOs.length == 0) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT, "No input UTXOs provided",
    );
  } else if (feeRate <= 0) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT, "Invalid fee rate",
    );
  }
}

/**
 * Validate the parameters for staking.
 * 
 * @param {Params} params - The staking parameters.
 * @throws {StakingError} - If the parameters are invalid.
 */
export const validateParams = (params: Params) => {
  if (params.covenantPks.length == 0) {
    throw new StakingError(
      StakingErrorCode.INVALID_PARAMS,
      "Could not find any covenant public keys",
    );
  }
  if (params.covenantPks.length < params.covenantQuorum) {
    throw new StakingError(
      StakingErrorCode.INVALID_PARAMS,
      "Covenant public keys must be greater than or equal to the quorum",
    );
  }
  if (params.unbondingTime <= 0) {
    throw new StakingError(
      StakingErrorCode.INVALID_PARAMS,
      "Unbonding time must be greater than 0",
    );
  }
  if (params.unbondingFeeSat <= 0) {
    throw new StakingError(
      StakingErrorCode.INVALID_PARAMS,
      "Unbonding fee must be greater than 0",
    );
  }
  if (params.maxStakingAmountSat < params.minStakingAmountSat) {
    throw new StakingError(
      StakingErrorCode.INVALID_PARAMS,
      "Max staking amount must be greater or equal to min staking amount",
    );
  }
  if (params.minStakingAmountSat <= 0) {
    throw new StakingError(
      StakingErrorCode.INVALID_PARAMS,
      "Min staking amount must be greater than 0",
    );
  }
  if (params.maxStakingTimeBlocks < params.minStakingTimeBlocks) {
    throw new StakingError(
      StakingErrorCode.INVALID_PARAMS,
      "Max staking time must be greater or equal to min staking time",
    );
  }
  if (params.minStakingTimeBlocks <= 0) {
    throw new StakingError(
      StakingErrorCode.INVALID_PARAMS,
      "Min staking time must be greater than 0",
    );
  }
  if (params.covenantQuorum <= 0) {
    throw new StakingError(
      StakingErrorCode.INVALID_PARAMS,
      "Covenant quorum must be greater than 0",
    );
  }
}