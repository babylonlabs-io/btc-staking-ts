// This sequence enables both the locktime field and also replace-by-fee
export const RBF_SEQUENCE = 0xfffffffd;
// This sequence means the transaction is not replaceable
export const NON_RBF_SEQUENCE = 0xffffffff;
// The PSBT version number used across the library
export const PSBT_VERSION = 2;