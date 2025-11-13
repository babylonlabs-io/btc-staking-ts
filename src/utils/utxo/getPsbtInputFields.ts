import { PsbtInputExtended } from "bip174/src/lib/interfaces";
import * as bitcoin from "bitcoinjs-lib";

import { StakingError, StakingErrorCode } from "../../error";
import { UTXO } from "../../types";
import { BitcoinScriptType, getScriptType } from "./getScriptType";

const validateRawTxHex = (utxo: UTXO, rawTxHex: string): Buffer => {
  const rawTxBuffer = Buffer.from(rawTxHex, "hex");

  let decodedTx: bitcoin.Transaction;
  try {
    decodedTx = bitcoin.Transaction.fromBuffer(rawTxBuffer);
  } catch (error) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT,
      `Failed to decode rawTxHex: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  const txid = decodedTx.getId();
  if (txid !== utxo.txid) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT,
      `Transaction ID mismatch: expected ${utxo.txid}, got ${txid}`,
    );
  }

  if (utxo.vout >= decodedTx.outs.length) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT,
      `Invalid vout index: ${utxo.vout} out of ${decodedTx.outs.length} outputs`,
    );
  }

  const output = decodedTx.outs[utxo.vout];
  const actualScriptPubKey = output.script.toString("hex");
  if (actualScriptPubKey !== utxo.scriptPubKey) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT,
      `Script mismatch at vout ${utxo.vout}: expected ${utxo.scriptPubKey}, got ${actualScriptPubKey}`,
    );
  }

  if (output.value !== utxo.value) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT,
      `Value mismatch at vout ${utxo.vout}: expected ${utxo.value}, got ${output.value}`,
    );
  }

  return rawTxBuffer;
};

const validateRedeemScript = (
  scriptPubKey: Buffer,
  redeemScript: string,
): Buffer => {
  const redeemScriptBuffer = Buffer.from(redeemScript, "hex");
  const redeemScriptHash = bitcoin.crypto.hash160(redeemScriptBuffer);
  const p2shPayment = bitcoin.payments.p2sh({ hash: redeemScriptHash });

  const expectedOutput = p2shPayment.output as Buffer;
  if (
    !expectedOutput ||
    scriptPubKey.toString("hex") !== expectedOutput.toString("hex")
  ) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT,
      "Redeem script hash does not match P2SH scriptPubKey",
    );
  }

  return redeemScriptBuffer;
};

const validateWitnessScript = (
  scriptPubKey: Buffer,
  witnessScript: string,
): Buffer => {
  const witnessScriptBuffer = Buffer.from(witnessScript, "hex");
  const witnessScriptHash = bitcoin.crypto.sha256(witnessScriptBuffer);
  const p2wshPayment = bitcoin.payments.p2wsh({ hash: witnessScriptHash });

  const expectedOutput = p2wshPayment.output as Buffer;
  if (
    !expectedOutput ||
    scriptPubKey.toString("hex") !== expectedOutput.toString("hex")
  ) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT,
      "Witness script hash does not match P2WSH scriptPubKey",
    );
  }

  return witnessScriptBuffer;
};

/**
 * Determines and constructs the correct PSBT input fields for a given UTXO based on its script type.
 * This function handles different Bitcoin script types (P2PKH, P2SH, P2WPKH, P2WSH, P2TR) and returns
 * the appropriate PSBT input fields required for that UTXO.
 *
 * @param {UTXO} utxo - The unspent transaction output to process
 * @param {Buffer} [publicKeyNoCoord] - The public of the staker (optional).
 * @returns {object} PSBT input fields object containing the necessary data
 * @throws {Error} If required input data is missing or if an unsupported script type is provided
 */

export const getPsbtInputFields = (
  utxo: UTXO,
  publicKeyNoCoord?: Buffer,
): PsbtInputExtended => {
  const scriptPubKey = Buffer.from(utxo.scriptPubKey, "hex");
  const type = getScriptType(scriptPubKey);

  switch (type) {
    case BitcoinScriptType.P2PKH: {
      if (!utxo.rawTxHex) {
        throw new StakingError(
          StakingErrorCode.INVALID_INPUT,
          "Missing rawTxHex for legacy P2PKH input",
        );
      }
      const nonWitnessUtxo = validateRawTxHex(utxo, utxo.rawTxHex);
      return { nonWitnessUtxo };
    }
    case BitcoinScriptType.P2SH: {
      if (!utxo.rawTxHex) {
        throw new StakingError(
          StakingErrorCode.INVALID_INPUT,
          "Missing rawTxHex for P2SH input",
        );
      }
      if (!utxo.redeemScript) {
        throw new StakingError(
          StakingErrorCode.INVALID_INPUT,
          "Missing redeemScript for P2SH input",
        );
      }
      const nonWitnessUtxo = validateRawTxHex(utxo, utxo.rawTxHex);
      const redeemScript = validateRedeemScript(
        scriptPubKey,
        utxo.redeemScript,
      );
      return {
        nonWitnessUtxo,
        redeemScript,
      };
    }
    case BitcoinScriptType.P2WPKH: {
      return {
        witnessUtxo: {
          script: scriptPubKey,
          value: utxo.value,
        },
      };
    }
    case BitcoinScriptType.P2WSH: {
      if (!utxo.witnessScript) {
        throw new StakingError(
          StakingErrorCode.INVALID_INPUT,
          "Missing witnessScript for P2WSH input",
        );
      }
      const witnessScript = validateWitnessScript(
        scriptPubKey,
        utxo.witnessScript,
      );
      return {
        witnessUtxo: {
          script: scriptPubKey,
          value: utxo.value,
        },
        witnessScript,
      };
    }
    case BitcoinScriptType.P2TR: {
      return {
        witnessUtxo: {
          script: scriptPubKey,
          value: utxo.value,
        },
        ...(publicKeyNoCoord && { tapInternalKey: publicKeyNoCoord }),
      };
    }
    default:
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        `Unsupported script type: ${type}`,
      );
  }
};
