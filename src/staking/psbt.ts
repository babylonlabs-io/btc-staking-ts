
import { UTXO } from "../types/UTXO";
import { Psbt, Transaction, networks, payments } from "bitcoinjs-lib";
import { Input } from "bitcoinjs-lib/src/transaction";
import { NO_COORD_PK_BYTE_LENGTH } from "../constants/keys";
import { internalPubkey } from "../constants/internalPubkey";
import { Taptree } from "bitcoinjs-lib/src/types";

const getInputWitnessUtxo = (inputUTXOs: UTXO[], input: Input) => {
  const inputUTXO = inputUTXOs.find(
    (utxo) => utxo.txid === input.hash.toString("hex") && utxo.vout === input.index,
  );
  if (!inputUTXO) {
    throw new Error(`Input UTXO not found for txid: ${input.hash.toString("hex")} and vout: ${input.index}`);
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
 * @param {UTXO[]} inputUTXOs - The UTXOs to use as inputs for the staking transaction.
 * @param {Buffer} publicKeyNoCoord - The public key for the staker in no-coordination format.
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
  },
  unbondingTx: Transaction,
  stakingTx: Transaction,
  network: networks.Network,
  covenantCovenants: string[],
  covenantSigs?: {
    btcPkHex: string;
    sigHex: string;
  }[],
) => {
  const psbt = new Psbt({ network });
  if (unbondingTx.version !== undefined) {
    psbt.setVersion(unbondingTx.version);
  }
  if (unbondingTx.locktime !== undefined) {
    psbt.setLocktime(unbondingTx.locktime);
  }

  // Unbonding transaction only has one input
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
    redeemVersion: 192,
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

  unbondingTx.outs.forEach((o) => {
    psbt.addOutput({
      script: o.script,
      value: o.value,
    });
  });

  // Add covenant witness if exists
  if (covenantSigs && covenantSigs.length > 0) {
    // Get the original witness stack
    const originalWitness = [
      inputTapLeafScript.controlBlock,
      inputTapLeafScript.script,
    ];
    // Add the covenant witness
    const updatedWitness = addCovenantWitness(
      originalWitness,
      covenantCovenants,
      covenantSigs,
    );
    // Update the witness stack
    psbt.updateInput(0, {
      finalScriptWitness: updatedWitness,
    });
  }

  return psbt;
}

/**
 * Add covenant witness to the psbt.
 * 
 * @param {Buffer[]} originalWitness - The original witness stack.
 * @param {string[]} paramsCovenants - The covenant covenants.
 * @param {Object} covenantSigs - The covenant signatures.
 * @returns {Buffer} - The updated witness stack.
 */
const addCovenantWitness = (
  originalWitness: Buffer[],
  paramsCovenants: string[],
  covenantSigs: {
    btcPkHex: string;
    sigHex: string;
  }[],
) => {
  const paramsCovenantsBuffers = paramsCovenants.map(
    (covenant) => Buffer.from(covenant, "hex"),
  );

  // map API response to Buffer values
  const covenantSigsBuffers = covenantSigs.map((sig) => ({
    btcPkHex: Buffer.from(sig.btcPkHex, "hex"),
    sigHex: Buffer.from(sig.sigHex, "hex"),
  }));
  // we need covenant from params to be sorted in reverse order
  const paramsCovenantsSorted = [...paramsCovenantsBuffers]
    .sort(Buffer.compare)
    .reverse();
  const composedCovenantSigs = paramsCovenantsSorted.map((covenant) => {
    // in case there's covenant with this btc_pk_hex we return the sig
    // otherwise we return empty Buffer
    const covenantSig = covenantSigsBuffers.find(
      (sig) => sig.btcPkHex.compare(covenant) === 0,
    );
    return covenantSig?.sigHex || Buffer.alloc(0);
  });
  return serializeWitnessStack([...composedCovenantSigs, ...originalWitness]);
};

/**
 * Serialize a witness stack into a single buffer.
 * 
 * @param {Buffer[]} stack - The witness stack to serialize.
 * @returns {Buffer} - The serialized witness stack.
 */
const serializeWitnessStack = (stack: Buffer[]): Buffer => {
  const serializedItems = stack.map((item) => {
    const lengthPrefix = Buffer.from([item.length]); // Add length prefix
    return Buffer.concat([lengthPrefix, item]); // Combine length and item
  });
  return Buffer.concat(serializedItems);
};