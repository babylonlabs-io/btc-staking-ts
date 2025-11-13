import { Psbt } from "bitcoinjs-lib";
import { StakingError, StakingErrorCode } from "../../error";

/**
 * Validates that a signed PSBT matches the original unsigned PSBT template.
 *
 * This function performs critical security validation to prevent malicious wallets,
 * browser extensions, or MITM attackers from tampering with transaction details
 * before signing. It ensures that:
 * - All inputs remain unchanged (txid, vout, sequence)
 * - All outputs remain unchanged (scriptPubKey, value)
 * - Transaction metadata remains unchanged (version, locktime)
 *
 * @param unsignedPsbt - The original unsigned PSBT template
 * @param signedPsbt - The PSBT returned from the signing provider
 * @throws {StakingError} If any mismatch is detected between unsigned and signed PSBTs
 */
export function validateSignedPsbtIntegrity(
  unsignedPsbt: Psbt,
  signedPsbt: Psbt,
): void {
  // 1. Validate input count
  if (signedPsbt.data.inputs.length !== unsignedPsbt.data.inputs.length) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT,
      `PSBT integrity violation: Input count mismatch. ` +
        `Expected: ${unsignedPsbt.data.inputs.length}, ` +
        `Got: ${signedPsbt.data.inputs.length}.`,
    );
  }

  // 2. Validate each input
  for (let i = 0; i < unsignedPsbt.data.inputs.length; i++) {
    const unsignedInput = unsignedPsbt.txInputs[i];
    const signedInput = signedPsbt.txInputs[i];

    // Check input hash (txid)
    if (!unsignedInput.hash.equals(signedInput.hash)) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        `PSBT integrity violation: Input ${i} txid mismatch. ` +
          `Expected: ${unsignedInput.hash.toString("hex")}, ` +
          `Got: ${signedInput.hash.toString("hex")}.`,
      );
    }

    // Check input index (vout)
    if (unsignedInput.index !== signedInput.index) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        `PSBT integrity violation: Input ${i} index mismatch. ` +
          `Expected: ${unsignedInput.index}, ` +
          `Got: ${signedInput.index}.`,
      );
    }

    // Check sequence
    if (unsignedInput.sequence !== signedInput.sequence) {
      throw new StakingError(
        StakingErrorCode.INVALID_INPUT,
        `PSBT integrity violation: Input ${i} sequence mismatch. ` +
          `Expected: ${unsignedInput.sequence}, ` +
          `Got: ${signedInput.sequence}.`,
      );
    }
  }

  // 3. Validate output count
  if (signedPsbt.data.outputs.length !== unsignedPsbt.data.outputs.length) {
    throw new StakingError(
      StakingErrorCode.INVALID_OUTPUT,
      `PSBT integrity violation: Output count mismatch. ` +
        `Expected: ${unsignedPsbt.data.outputs.length}, ` +
        `Got: ${signedPsbt.data.outputs.length}.`,
    );
  }

  // 4. Validate each output
  for (let i = 0; i < unsignedPsbt.data.outputs.length; i++) {
    const unsignedOutput = unsignedPsbt.txOutputs[i];
    const signedOutput = signedPsbt.txOutputs[i];

    // Check output script (this prevents address redirection attacks)
    if (!unsignedOutput.script.equals(signedOutput.script)) {
      throw new StakingError(
        StakingErrorCode.INVALID_OUTPUT,
        `PSBT integrity violation: Output ${i} script mismatch. ` +
          `Expected: ${unsignedOutput.script.toString("hex")}, ` +
          `Got: ${signedOutput.script.toString("hex")}.`,
      );
    }

    // Check output value (this prevents value manipulation attacks)
    if (unsignedOutput.value !== signedOutput.value) {
      throw new StakingError(
        StakingErrorCode.INVALID_OUTPUT,
        `PSBT integrity violation: Output ${i} value mismatch. ` +
          `Expected: ${unsignedOutput.value} sats, ` +
          `Got: ${signedOutput.value} sats.`,
      );
    }
  }

  // 5. Validate transaction version
  if (unsignedPsbt.version !== signedPsbt.version) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT,
      `PSBT integrity violation: Transaction version mismatch. ` +
        `Expected: ${unsignedPsbt.version}, ` +
        `Got: ${signedPsbt.version}.`,
    );
  }

  // 6. Validate locktime
  if (unsignedPsbt.locktime !== signedPsbt.locktime) {
    throw new StakingError(
      StakingErrorCode.INVALID_INPUT,
      `PSBT integrity violation: Transaction locktime mismatch. ` +
        `Expected: ${unsignedPsbt.locktime}, ` +
        `Got: ${signedPsbt.locktime}.`,
    );
  }

  // If we reach here, the PSBT has passed all integrity checks
  // The only differences should be signatures/witness data added by the signer
}
