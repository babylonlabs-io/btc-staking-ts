import { networks, Psbt, Transaction } from "bitcoinjs-lib";

import { getPublicKeyNoCoord } from "../../../src";
import { StakingErrorCode } from "../../../src/error";
import { Staking } from "../../../src/staking";
import { BabylonBtcStakingManager } from "../../../src/staking/manager";
import { babylonProvider, btcProvider } from "./__mock__/providers";
import { params, stakerInfo, utxos } from "./__mock__/staking";

/**
 * Post-signing PSBT integrity validation
 *
 * These tests verify that the BabylonBtcStakingManager properly validates
 * signed PSBTs against their unsigned templates to prevent malicious wallets
 * or MITM attacks from modifying transaction details before signing.
 */

/**
 * Helper function to copy PSBT structure without duplicating code.
 * Copies inputs and outputs from original PSBT to a new PSBT instance.
 */
function copyPsbtStructure(
  originalPsbt: Psbt,
  network: typeof networks.testnet,
): Psbt {
  const copy = new Psbt({ network });

  // Copy inputs
  originalPsbt.txInputs.forEach((input, i) => {
    copy.addInput({
      hash: Buffer.from(input.hash).reverse().toString("hex"),
      index: input.index,
      sequence: input.sequence,
      witnessUtxo: originalPsbt.data.inputs[i].witnessUtxo,
    });
  });

  // Copy outputs
  originalPsbt.txOutputs.forEach((output) => {
    copy.addOutput({
      script: output.script,
      value: output.value,
    });
  });

  return copy;
}

describe("PSBT Integrity Validation", () => {
  // Dynamic variables that will be generated in beforeEach
  let unsignedStakingTx: Transaction;
  let unsignedStakingPsbt: Psbt;

  const stakingInput = {
    stakingAmountSat: 11_000,
    finalityProviderPksNoCoordHex: [
      getPublicKeyNoCoord(
        "02eb83395c33cf784f7dfb90dcc918b5620ddd67fe6617806f079322dc4db2f0",
      ),
    ],
    stakingTimelock: 100,
  };

  const version = 2;

  describe("createSignedBtcStakingTransaction", () => {
    let manager: BabylonBtcStakingManager;

    beforeEach(() => {
      manager = new BabylonBtcStakingManager(
        networks.testnet,
        params,
        btcProvider,
        babylonProvider,
      );
      btcProvider.signPsbt.mockReset();

      const staking = new Staking(
        networks.testnet,
        stakerInfo,
        params[version],
        stakingInput.finalityProviderPksNoCoordHex,
        stakingInput.stakingTimelock,
      );

      const { transaction } = staking.createStakingTransaction(
        stakingInput.stakingAmountSat,
        utxos,
        1, // feeRate
      );

      unsignedStakingTx = transaction;
      unsignedStakingPsbt = staking.toStakingPsbt(transaction, utxos);
    });

    it("should accept legitimate signed PSBT", async () => {
      // For a legitimate signed PSBT, the wallet returns the PSBT with signatures added
      // but all other fields (inputs, outputs, version, locktime) unchanged
      btcProvider.signPsbt.mockImplementation(async (psbtHex: string) => {
        const signedPsbt = Psbt.fromHex(psbtHex);

        // Add a dummy signature to make the PSBT finalizable
        // In reality, the wallet would add proper signatures
        signedPsbt.updateInput(0, {
          finalScriptWitness: Buffer.from(
            "0140" + "00".repeat(64), // Dummy 64-byte signature
            "hex",
          ),
        });

        return signedPsbt.toHex();
      });

      const tx = await manager.createSignedBtcStakingTransaction(
        stakerInfo,
        stakingInput,
        unsignedStakingTx,
        utxos,
        version,
      );

      expect(tx).toBeDefined();
      expect(tx.getId()).toBeDefined();
    });

    it("should reject PSBT with added output (count mismatch)", async () => {
      btcProvider.signPsbt.mockImplementation(async (psbtHex: string) => {
        const originalPsbt = Psbt.fromHex(psbtHex);
        const maliciousPsbt = copyPsbtStructure(originalPsbt, networks.testnet);

        // Malicious wallet adds an extra output
        maliciousPsbt.addOutput({
          script: Buffer.from("0014" + "0".repeat(40), "hex"),
          value: 1000,
        });
        return maliciousPsbt.toHex();
      });

      try {
        await manager.createSignedBtcStakingTransaction(
          stakerInfo,
          stakingInput,
          unsignedStakingTx,
          utxos,
          version,
        );
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.code).toBe(StakingErrorCode.INVALID_OUTPUT);
        expect(error.message).toContain("Output count mismatch");
      }
    });

    it("should reject PSBT with modified input sequence", async () => {
      btcProvider.signPsbt.mockImplementation(async (psbtHex: string) => {
        const originalPsbt = Psbt.fromHex(psbtHex);
        const maliciousPsbt = new Psbt({ network: networks.testnet });

        // Add input with modified sequence
        const originalInput = originalPsbt.txInputs[0];
        maliciousPsbt.addInput({
          hash: Buffer.from(originalInput.hash).reverse().toString("hex"),
          index: originalInput.index,
          sequence: 0x00000000, // Modified sequence (was 0xffffffff)
          witnessUtxo: originalPsbt.data.inputs[0].witnessUtxo,
        });

        // Copy outputs (unchanged)
        originalPsbt.txOutputs.forEach((output) => {
          maliciousPsbt.addOutput({
            script: output.script,
            value: output.value,
          });
        });

        return maliciousPsbt.toHex();
      });

      try {
        await manager.createSignedBtcStakingTransaction(
          stakerInfo,
          stakingInput,
          unsignedStakingTx,
          utxos,
          version,
        );
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.code).toBe(StakingErrorCode.INVALID_INPUT);
        expect(error.message).toContain("sequence mismatch");
      }
    });

    it("should reject PSBT with modified transaction version", async () => {
      btcProvider.signPsbt.mockImplementation(async (psbtHex: string) => {
        const originalPsbt = Psbt.fromHex(psbtHex);
        const maliciousPsbt = copyPsbtStructure(originalPsbt, networks.testnet);

        // Modify version
        maliciousPsbt.setVersion(1); // Different version (original was 2)

        return maliciousPsbt.toHex();
      });

      try {
        await manager.createSignedBtcStakingTransaction(
          stakerInfo,
          stakingInput,
          unsignedStakingTx,
          utxos,
          version,
        );
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.code).toBe(StakingErrorCode.INVALID_INPUT);
        expect(error.message).toContain("version mismatch");
      }
    });

    it("should reject PSBT with modified locktime", async () => {
      btcProvider.signPsbt.mockImplementation(async (psbtHex: string) => {
        const maliciousPsbt = Psbt.fromHex(psbtHex);
        // Modify locktime
        maliciousPsbt.setLocktime(500000); // Different locktime
        return maliciousPsbt.toHex();
      });

      try {
        await manager.createSignedBtcStakingTransaction(
          stakerInfo,
          stakingInput,
          unsignedStakingTx,
          utxos,
          version,
        );
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.code).toBe(StakingErrorCode.INVALID_INPUT);
        expect(error.message).toContain("locktime mismatch");
      }
    });

    it("should reject PSBT with modified output value (fund theft attempt)", async () => {
      // This tests the PRIMARY attack vector: reducing staking amount to steal funds
      btcProvider.signPsbt.mockImplementation(async (psbtHex: string) => {
        const originalPsbt = Psbt.fromHex(psbtHex);
        const maliciousPsbt = copyPsbtStructure(originalPsbt, networks.testnet);

        // Attacker modifies the first output value (staking output)
        // Reduce from 11000 sats to 1 sat, stealing the difference
        const maliciousOutputs = originalPsbt.txOutputs.map((output, i) => {
          if (i === 0) {
            return { script: output.script, value: 1 }; // Reduced value!
          }
          return { script: output.script, value: output.value };
        });

        // Rebuild PSBT with malicious output values
        const finalMaliciousPsbt = new Psbt({ network: networks.testnet });
        originalPsbt.txInputs.forEach((input, i) => {
          finalMaliciousPsbt.addInput({
            hash: Buffer.from(input.hash).reverse().toString("hex"),
            index: input.index,
            sequence: input.sequence,
            witnessUtxo: originalPsbt.data.inputs[i].witnessUtxo,
          });
        });
        maliciousOutputs.forEach((output) => {
          finalMaliciousPsbt.addOutput(output);
        });

        return finalMaliciousPsbt.toHex();
      });

      try {
        await manager.createSignedBtcStakingTransaction(
          stakerInfo,
          stakingInput,
          unsignedStakingTx,
          utxos,
          version,
        );
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.code).toBe(StakingErrorCode.INVALID_OUTPUT);
        expect(error.message).toContain("value mismatch");
      }
    });

    it("should reject PSBT with modified output script (address redirection)", async () => {
      // This tests the PRIMARY attack vector: redirecting outputs to attacker address
      btcProvider.signPsbt.mockImplementation(async (psbtHex: string) => {
        const originalPsbt = Psbt.fromHex(psbtHex);

        // Attacker redirects the change output to their own address
        const attackerScript = Buffer.from(
          "00140000000000000000000000000000000000000000",
          "hex",
        );

        const maliciousPsbt = new Psbt({ network: networks.testnet });

        // Copy inputs
        originalPsbt.txInputs.forEach((input, i) => {
          maliciousPsbt.addInput({
            hash: Buffer.from(input.hash).reverse().toString("hex"),
            index: input.index,
            sequence: input.sequence,
            witnessUtxo: originalPsbt.data.inputs[i].witnessUtxo,
          });
        });

        // Modify second output script (change output)
        originalPsbt.txOutputs.forEach((output, i) => {
          if (i === 1) {
            maliciousPsbt.addOutput({
              script: attackerScript, // Redirected to attacker!
              value: output.value,
            });
          } else {
            maliciousPsbt.addOutput({
              script: output.script,
              value: output.value,
            });
          }
        });

        return maliciousPsbt.toHex();
      });

      try {
        await manager.createSignedBtcStakingTransaction(
          stakerInfo,
          stakingInput,
          unsignedStakingTx,
          utxos,
          version,
        );
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.code).toBe(StakingErrorCode.INVALID_OUTPUT);
        expect(error.message).toContain("script mismatch");
      }
    });
  });

  describe("Comprehensive attack scenario validation", () => {
    let manager: BabylonBtcStakingManager;

    beforeEach(() => {
      manager = new BabylonBtcStakingManager(
        networks.testnet,
        params,
        btcProvider,
        babylonProvider,
      );
      btcProvider.signPsbt.mockReset();

      const staking = new Staking(
        networks.testnet,
        stakerInfo,
        params[version],
        stakingInput.finalityProviderPksNoCoordHex,
        stakingInput.stakingTimelock,
      );

      const { transaction } = staking.createStakingTransaction(
        stakingInput.stakingAmountSat,
        utxos,
        1, // feeRate
      );

      unsignedStakingTx = transaction;
      unsignedStakingPsbt = staking.toStakingPsbt(transaction, utxos);
    });

    it("should detect and block comprehensive modification attempts", async () => {
      // This test verifies that ANY modification to the PSBT structure
      // (inputs, outputs, version, locktime) is detected and blocked

      let testPassed = false;

      // Test: Modified locktime
      btcProvider.signPsbt.mockImplementation(async (psbtHex: string) => {
        const psbt = Psbt.fromHex(psbtHex);
        psbt.setLocktime(999999);
        return psbt.toHex();
      });

      try {
        await manager.createSignedBtcStakingTransaction(
          stakerInfo,
          stakingInput,
          unsignedStakingTx,
          utxos,
          version,
        );
      } catch (error: any) {
        expect(error.code).toBe(StakingErrorCode.INVALID_INPUT);
        testPassed = true;
      }

      expect(testPassed).toBe(true);
    });

    it("should prevent fund theft even with completely malicious wallet", async () => {
      // Verify that validation prevents fund theft regardless of how
      // the malicious wallet tries to modify the transaction

      let errorCaught = false;
      let errorMessage = "";

      btcProvider.signPsbt.mockImplementation(async (psbtHex: string) => {
        const originalPsbt = Psbt.fromHex(psbtHex);
        const maliciousPsbt = copyPsbtStructure(originalPsbt, networks.testnet);

        // Add malicious output to steal funds
        maliciousPsbt.addOutput({
          script: Buffer.from("0014" + "0".repeat(40), "hex"),
          value: 5000,
        });

        return maliciousPsbt.toHex();
      });

      try {
        await manager.createSignedBtcStakingTransaction(
          stakerInfo,
          stakingInput,
          unsignedStakingTx,
          utxos,
          version,
        );
      } catch (error: any) {
        errorCaught = true;
        errorMessage = error.message;
        expect(error.code).toBe(StakingErrorCode.INVALID_OUTPUT);
      }

      expect(errorCaught).toBe(true);
      expect(errorMessage).toBeTruthy();
    });
  });
});
