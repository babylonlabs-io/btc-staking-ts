import { Psbt, Transaction, networks, payments } from "bitcoinjs-lib";
import { Taptree } from "bitcoinjs-lib/src/types";
import { internalPubkey } from "../constants/internalPubkey";
import { NO_COORD_PK_BYTE_LENGTH } from "../constants/keys";
import { REDEEM_VERSION } from "../constants/transaction";
import { UTXO } from "../types/UTXO";
import { deriveUnbondingOutputInfo } from "../utils/staking";
import { findInputUTXO } from "../utils/utxo/findInputUTXO";
import { getPsbtInputFields } from "../utils/utxo/getPsbtInputFields";
import { StakingScripts } from "./stakingScript";

/**
 * Creates taproot spending input data for a previous staking UTXO.
 * This helper consolidates the shared logic between stakingExpansionPsbt and unbondingPsbt.
 */
const createTaprootSpendingInput = (
  scripts: {
    slashingScript: Buffer;
    unbondingScript: Buffer;
    timelockScript: Buffer;
  },
  network: networks.Network,
  inputHash: Buffer,
  inputIndex: number,
  inputSequence: number,
  witnessUtxo: {
    value: number;
    script: Buffer;
  },
) => {
  const inputScriptTree: Taptree = [
    { output: scripts.slashingScript },
    [{ output: scripts.unbondingScript }, { output: scripts.timelockScript }],
  ];

  const inputRedeem = {
    output: scripts.unbondingScript,
    redeemVersion: REDEEM_VERSION,
  };

  const p2tr = payments.p2tr({
    internalPubkey,
    scriptTree: inputScriptTree,
    redeem: inputRedeem,
    network,
  });

  const inputTapLeafScript = {
    leafVersion: inputRedeem.redeemVersion,
    script: inputRedeem.output,
    controlBlock: p2tr.witness![p2tr.witness!.length - 1],
  };

  return {
    hash: inputHash,
    index: inputIndex,
    sequence: inputSequence,
    tapInternalKey: internalPubkey,
    witnessUtxo,
    tapLeafScript: [inputTapLeafScript],
  };
};

/**
 * Convert a staking transaction to a PSBT.
 *
 * @param {Transaction} stakingTx - The staking transaction to convert to PSBT.
 * @param {networks.Network} network - The network to use for the PSBT.
 * @param {UTXO[]} inputUTXOs - The UTXOs to be used as inputs for the staking
 * transaction.
 * @param {Buffer} [publicKeyNoCoord] - The public key of staker (optional)
 * @returns {Psbt} - The PSBT for the staking transaction.
 * @throws {Error} If unable to create PSBT from transaction
 */
export const stakingPsbt = (
  stakingTx: Transaction,
  network: networks.Network,
  inputUTXOs: UTXO[],
  publicKeyNoCoord?: Buffer,
): Psbt => {
  if (publicKeyNoCoord && publicKeyNoCoord.length !== NO_COORD_PK_BYTE_LENGTH) {
    throw new Error("Invalid public key");
  }

  const psbt = new Psbt({ network });

  if (stakingTx.version !== undefined) psbt.setVersion(stakingTx.version);
  if (stakingTx.locktime !== undefined) psbt.setLocktime(stakingTx.locktime);

  stakingTx.ins.forEach((input) => {
    const inputUTXO = findInputUTXO(inputUTXOs, input);
    const psbtInputData = getPsbtInputFields(inputUTXO, publicKeyNoCoord);

    psbt.addInput({
      hash: input.hash,
      index: input.index,
      sequence: input.sequence,
      ...psbtInputData,
    });
  });

  stakingTx.outs.forEach((o) => {
    psbt.addOutput({ script: o.script, value: o.value });
  });

  return psbt;
};

/**
 * Convert a staking expansion transaction to a PSBT with proper script path handling
 * for the previous staking UTXO.
 *
 * @param {Transaction} stakingTx - The staking expansion transaction to convert to PSBT.
 * @param {number} stakingOutputIndex - The index of the staking output in the staking transaction.
 * @param {networks.Network} network - The network to use for the PSBT.
 * @param {UTXO[]} inputUTXOs - The UTXOs to be used as inputs for the staking transaction.
 * @param {Object} originalScripts - The original staking scripts for spending the previous staking UTXO.
 * @param {Buffer} [publicKeyNoCoord] - The public key of staker (optional)
 * @returns {Psbt} - The PSBT for the staking expansion transaction.
 * @throws {Error} If unable to create PSBT from transaction
 */
export const stakingExpansionPsbt = (
  stakingTx: Transaction,
  stakingOutputIndex: number,
  network: networks.Network,
  inputUTXOs: UTXO[],
  originalScripts: StakingScripts,
  publicKeyNoCoord?: Buffer,
): Psbt => {
  if (publicKeyNoCoord && publicKeyNoCoord.length !== NO_COORD_PK_BYTE_LENGTH) {
    throw new Error("Invalid public key");
  }

  const psbt = new Psbt({ network });

  if (stakingTx.version !== undefined) psbt.setVersion(stakingTx.version);
  if (stakingTx.locktime !== undefined) psbt.setLocktime(stakingTx.locktime);

  stakingTx.ins.forEach((input, index) => {
    const inputUTXO = findInputUTXO(inputUTXOs, input);

    // Check if this is the previous staking UTXO
    const isPreviousStakingUtxo = index === stakingOutputIndex;

    if (isPreviousStakingUtxo) {
      // Handle previous staking UTXO with unbonding path spending
      // Use original scripts to match the witness program hash of the previous staking UTXO
      const taprootInputData = createTaprootSpendingInput(
        originalScripts,
        network,
        input.hash,
        input.index,
        input.sequence,
        {
          value: inputUTXO.value,
          script: Buffer.from(inputUTXO.scriptPubKey, "hex"),
        },
      );

      psbt.addInput(taprootInputData);
    } else {
      // Handle funding transaction UTXO normally
      const psbtInputData = getPsbtInputFields(inputUTXO, publicKeyNoCoord);

      psbt.addInput({
        hash: input.hash,
        index: input.index,
        sequence: input.sequence,
        ...psbtInputData,
      });
    }
  });

  stakingTx.outs.forEach((o) => {
    psbt.addOutput({ script: o.script, value: o.value });
  });

  return psbt;
};

export const unbondingPsbt = (
  scripts: {
    unbondingScript: Buffer;
    timelockScript: Buffer;
    slashingScript: Buffer;
    unbondingTimelockScript: Buffer;
  },
  unbondingTx: Transaction,
  stakingTx: Transaction,
  network: networks.Network,
): Psbt => {
  if (unbondingTx.outs.length !== 1) {
    throw new Error("Unbonding transaction must have exactly one output");
  }
  if (unbondingTx.ins.length !== 1) {
    throw new Error("Unbonding transaction must have exactly one input");
  }

  validateUnbondingOutput(scripts, unbondingTx, network);

  const psbt = new Psbt({ network });

  if (unbondingTx.version !== undefined) {
    psbt.setVersion(unbondingTx.version);
  }
  if (unbondingTx.locktime !== undefined) {
    psbt.setLocktime(unbondingTx.locktime);
  }

  const input = unbondingTx.ins[0];
  const outputIndex = input.index;

  const taprootInputData = createTaprootSpendingInput(
    scripts,
    network,
    input.hash,
    input.index,
    input.sequence,
    {
      value: stakingTx.outs[outputIndex].value,
      script: stakingTx.outs[outputIndex].script,
    },
  );

  psbt.addInput(taprootInputData);

  psbt.addOutput({
    script: unbondingTx.outs[0].script,
    value: unbondingTx.outs[0].value,
  });

  return psbt;
};

/**
 * Validate the unbonding output for a given unbonding transaction.
 *
 * @param {Object} scripts - The scripts to use for the unbonding output.
 * @param {Transaction} unbondingTx - The unbonding transaction.
 * @param {networks.Network} network - The network to use for the unbonding output.
 */
const validateUnbondingOutput = (
  scripts: {
    slashingScript: Buffer;
    unbondingTimelockScript: Buffer;
  },
  unbondingTx: Transaction,
  network: networks.Network,
) => {
  const unbondingOutputInfo = deriveUnbondingOutputInfo(scripts, network);
  if (
    unbondingOutputInfo.scriptPubKey.toString("hex") !==
    unbondingTx.outs[0].script.toString("hex")
  ) {
    throw new Error(
      "Unbonding output script does not match the expected" +
        " script while building psbt",
    );
  }
};
