import { UTXO } from "../types/UTXO";
import { Psbt, Transaction, address, networks, payments } from "bitcoinjs-lib";
import { Input } from "bitcoinjs-lib/src/transaction";
import { NO_COORD_PK_BYTE_LENGTH } from "../constants/keys";
import { internalPubkey } from "../constants/internalPubkey";
import { Taptree } from "bitcoinjs-lib/src/types";
import { transactionIdToHash } from "../utils/btc";
import { REDEEM_VERSION } from "../constants/transaction";

interface InputWitnessUtxo {
  script: Buffer;
  value: number;
}

/**
 * Get the input witness utxo for the staking transaction.
 * 
 * @param {UTXO[]} inputUTXOs - The UTXOs to be used as inputs for the staking 
 * transaction.
 * @param {Input} input - The input to get the witness utxo for.
 * @returns {InputWitnessUtxo} - The witness utxo.
 */
const getInputWitnessUtxo = (
  inputUTXOs: UTXO[],
  input: Input,
): InputWitnessUtxo => {
  const inputUTXO = inputUTXOs.find(
    (utxo) => {
      return transactionIdToHash(utxo.txid).toString("hex") === input.hash.toString("hex")
        && utxo.vout === input.index;
    }
  );
  if (!inputUTXO) {
    throw new Error(
      `Input UTXO not found for txid: ${Buffer.from(input.hash).reverse().toString("hex")} `
      + `and vout: ${input.index}`
    );
  }
  return {
    script: Buffer.from(inputUTXO.scriptPubKey, "hex"),
    value: inputUTXO.value,
  };
};

/**
 * Convert a staking transaction to a psbt.
 * 
 * @param {Transaction} stakingTx - The staking transaction to convert to psbt.
 * @param {networks.Network} network - The network to use for the psbt.
 * @param {UTXO[]} inputUTXOs - The UTXOs to be used as inputs for the staking 
 * transaction.
 * @param {Buffer} publicKeyNoCoord - The public key for the staker in
 * no-coordination format.
 * @returns {Psbt} - The psbt for the staking transaction.
 */
export const stakingPsbt = (
  stakingTx: Transaction,
  network: networks.Network,
  inputUTXOs: UTXO[],
  publicKeyNoCoord?: Buffer,
) => {

  // Check whether the public key is valid
  if (publicKeyNoCoord && publicKeyNoCoord.length !== NO_COORD_PK_BYTE_LENGTH) {
    throw new Error("Invalid public key");
  }
  
  const psbt = new Psbt({ network });
  if (stakingTx.version !== undefined) {
    psbt.setVersion(stakingTx.version);
  }
  if (stakingTx.locktime !== undefined) {
    psbt.setLocktime(stakingTx.locktime);
  }

  stakingTx.ins.forEach((i) => {
    psbt.addInput({
      hash: i.hash,
      index: i.index,
      sequence: i.sequence,
      witnessUtxo: getInputWitnessUtxo(inputUTXOs, i),
      // this is needed only if the wallet is in taproot mode
      ...(publicKeyNoCoord && { tapInternalKey: publicKeyNoCoord }),
    });
  });

  stakingTx.outs.forEach((o) => {
    psbt.addOutput({
      script: o.script,
      value: o.value,
    });
  });

  return psbt;
}

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
) => {
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

  // Build input tapleaf script
  const inputScriptTree: Taptree = [
    {
      output: scripts.slashingScript,
    },
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
  
  psbt.addInput({
    hash: input.hash,
    index: input.index,
    sequence: input.sequence,
    tapInternalKey: internalPubkey,
    witnessUtxo: {
      value: stakingTx.outs[outputIndex].value,
      script: stakingTx.outs[outputIndex].script,
    },
    tapLeafScript: [inputTapLeafScript],
  });

  psbt.addOutput({
    script: unbondingTx.outs[0].script,
    value: unbondingTx.outs[0].value,
  });

  return psbt;
}

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
  // Check the unbonding output index is valid by deriving the expected 
  const outputScriptTree: Taptree = [
    {
      output: scripts.slashingScript,
    },
    { output: scripts.unbondingTimelockScript },
  ];

  const unbondingOutput = payments.p2tr({
    internalPubkey,
    scriptTree: outputScriptTree,
    network,
  });
  if (!unbondingOutput.address) {
    throw new Error("Unbonding output address is not defined while building psbt");
  }
  const unbondingOutputScript = address.toOutputScript(
    unbondingOutput.address,
    network,
  );
  if (
    unbondingOutputScript.toString("hex") !==
     unbondingTx.outs[0].script.toString("hex")
  ) {
    throw new Error("Unbonding output script does not match the expected" +
      " script while building psbt");
  }
}