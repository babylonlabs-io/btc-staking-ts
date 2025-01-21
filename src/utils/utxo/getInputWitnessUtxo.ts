import { Input } from "bitcoinjs-lib/src/transaction";

import { UTXO } from "../../types/UTXO";
import { findInputUTXO } from "./findInputUTXO";

interface InputWitnessUtxo {
  script: Buffer;
  value: number;
}

/**
 * Returns the witness UTXO information needed for adding an input to a PSBT.
 * This function finds the matching UTXO from a list of UTXOs based on the transaction input's
 * hash and index (vout). It returns the scriptPubKey and value required by psbt.addInput()
 *
 * @param inputUTXOs - Array of UTXO objects containing transaction details
 * @param input - Transaction input containing the hash and index to match against UTXOs
 * @returns {InputWitnessUtxo} Object containing:
 *   - script: Buffer of the UTXO's scriptPubKey
 *   - value: Number representing the UTXO amount in satoshis
 * @throws Error if no matching UTXO is found for the input
 */

export const getInputWitnessUTXO = (
  inputUTXOs: UTXO[],
  input: Input,
): InputWitnessUtxo => {
  const inputUTXO = findInputUTXO(inputUTXOs, input);

  return {
    script: Buffer.from(inputUTXO.scriptPubKey, "hex"),
    value: inputUTXO.value,
  };
};
