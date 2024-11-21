import { Psbt, Transaction } from "bitcoinjs-lib";

/**
 * PsbtResult is the result of a transaction creation
 *  - psbt: The partially signed transaction
 *  - fee: The total fee of the transaction
 */
export interface PsbtResult {
  psbt: Psbt;
  fee: number;
}

/**
 * TransactionResult is the result of a transaction creation
 *  - transaction: The unsigned transaction
 *  - fee: The total fee of the transaction
 */
export interface TransactionResult {
  transaction: Transaction;
  fee: number;
}

/**
 * PsbtTransactionResult is the result of a transaction creation
 *  - transaction: The unsigned transaction
 */
export interface PsbtTransactionResult extends PsbtResult {
  transaction: Transaction;
}
