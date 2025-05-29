/**
 * Enum for standardized contract IDs used in BTC staking operations
 * These IDs are used when signing PSBTs to identify the contract context
 */

export enum ContractId {
  STAKING = "babylon:staking",
  UNBONDING = "babylon:unbonding",
  SLASHING = "babylon:slashing",
  WITHDRAW_STAKING_EXPIRED = "babylon:withdraw-staking-expired",
  WITHDRAW_EARLY_UNBONDED = "babylon:withdraw-early-unbonded",
  WITHDRAW_SLASHING = "babylon:withdraw-slashing",
}
