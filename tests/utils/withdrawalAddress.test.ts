import { networks, payments, script } from "bitcoinjs-lib";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";

import { StakingError, StakingErrorCode } from "../../src/error";
import {
  assertWithdrawalAddressesValid,
  deriveAllowedWithdrawalAddresses,
  validateWithdrawalOutputs,
} from "../../src/utils/withdrawalAddress";
import { testingNetworks } from "../helper";

describe("deriveAllowedWithdrawalAddresses", () => {
  describe.each(testingNetworks)(
    "should derive addresses on $networkName",
    ({ network, datagen: { stakingDatagen: dataGenerator } }) => {
      it("should derive both P2TR and P2WPKH addresses from compressed public key", () => {
        const { publicKey } = dataGenerator.generateRandomKeyPair();

        const addresses = deriveAllowedWithdrawalAddresses(publicKey, network);

        expect(addresses).toHaveLength(2);

        const publicKeyBuffer = Buffer.from(publicKey, "hex");
        const expectedP2tr = payments.p2tr({
          internalPubkey: toXOnly(publicKeyBuffer),
          network,
        }).address;
        const expectedP2wpkh = payments.p2wpkh({
          pubkey: publicKeyBuffer,
          network,
        }).address;

        expect(addresses).toContain(expectedP2tr);
        expect(addresses).toContain(expectedP2wpkh);
      });

      it("should derive only P2TR address from x-only public key (32 bytes)", () => {
        const { publicKeyNoCoord } = dataGenerator.generateRandomKeyPair();

        const addresses = deriveAllowedWithdrawalAddresses(
          publicKeyNoCoord,
          network,
        );

        expect(addresses).toHaveLength(1);

        const publicKeyBuffer = Buffer.from(publicKeyNoCoord, "hex");
        const expectedP2tr = payments.p2tr({
          internalPubkey: publicKeyBuffer,
          network,
        }).address;

        expect(addresses[0]).toBe(expectedP2tr);
      });

      it("should derive different addresses for different networks", () => {
        const { publicKey } = dataGenerator.generateRandomKeyPair();

        const mainnetAddresses = deriveAllowedWithdrawalAddresses(
          publicKey,
          networks.bitcoin,
        );
        const testnetAddresses = deriveAllowedWithdrawalAddresses(
          publicKey,
          networks.testnet,
        );

        expect(mainnetAddresses).not.toEqual(testnetAddresses);
        mainnetAddresses.forEach((addr) => {
          expect(addr.startsWith("bc1")).toBe(true);
        });
        testnetAddresses.forEach((addr) => {
          expect(addr.startsWith("tb1")).toBe(true);
        });
      });

      it("should derive different addresses for different public keys", () => {
        const { publicKey: pk1 } = dataGenerator.generateRandomKeyPair();
        const { publicKey: pk2 } = dataGenerator.generateRandomKeyPair();

        const addresses1 = deriveAllowedWithdrawalAddresses(pk1, network);
        const addresses2 = deriveAllowedWithdrawalAddresses(pk2, network);

        expect(addresses1).not.toEqual(addresses2);
      });
    },
  );
});

describe("validateWithdrawalOutputs", () => {
  describe.each(testingNetworks)(
    "should validate outputs on $networkName",
    ({ network, datagen: { stakingDatagen: dataGenerator } }) => {
      it("should return valid for P2TR output matching public key", () => {
        const { publicKey } = dataGenerator.generateRandomKeyPair();
        const publicKeyBuffer = Buffer.from(publicKey, "hex");

        const p2trPayment = payments.p2tr({
          internalPubkey: toXOnly(publicKeyBuffer),
          network,
        });
        const outputScripts = [p2trPayment.output!];

        const result = validateWithdrawalOutputs(
          outputScripts,
          publicKey,
          network,
        );

        expect(result.isValid).toBe(true);
        expect(result.invalidAddresses).toHaveLength(0);
      });

      it("should return valid for P2WPKH output matching public key", () => {
        const { publicKey } = dataGenerator.generateRandomKeyPair();
        const publicKeyBuffer = Buffer.from(publicKey, "hex");

        const p2wpkhPayment = payments.p2wpkh({
          pubkey: publicKeyBuffer,
          network,
        });
        const outputScripts = [p2wpkhPayment.output!];

        const result = validateWithdrawalOutputs(
          outputScripts,
          publicKey,
          network,
        );

        expect(result.isValid).toBe(true);
        expect(result.invalidAddresses).toHaveLength(0);
      });

      it("should return valid for multiple outputs all matching public key", () => {
        const { publicKey } = dataGenerator.generateRandomKeyPair();
        const publicKeyBuffer = Buffer.from(publicKey, "hex");

        const p2trPayment = payments.p2tr({
          internalPubkey: toXOnly(publicKeyBuffer),
          network,
        });
        const p2wpkhPayment = payments.p2wpkh({
          pubkey: publicKeyBuffer,
          network,
        });
        const outputScripts = [p2trPayment.output!, p2wpkhPayment.output!];

        const result = validateWithdrawalOutputs(
          outputScripts,
          publicKey,
          network,
        );

        expect(result.isValid).toBe(true);
        expect(result.invalidAddresses).toHaveLength(0);
      });

      it("should return invalid for output not matching public key", () => {
        const { publicKey: userPk } = dataGenerator.generateRandomKeyPair();
        const { publicKey: attackerPk } = dataGenerator.generateRandomKeyPair();

        const attackerPkBuffer = Buffer.from(attackerPk, "hex");
        const attackerPayment = payments.p2tr({
          internalPubkey: toXOnly(attackerPkBuffer),
          network,
        });
        const outputScripts = [attackerPayment.output!];

        const result = validateWithdrawalOutputs(
          outputScripts,
          userPk,
          network,
        );

        expect(result.isValid).toBe(false);
        expect(result.invalidAddresses).toHaveLength(1);
        expect(result.invalidAddresses[0]).toBe(attackerPayment.address);
      });

      it("should return invalid with all non-matching addresses listed", () => {
        const { publicKey: userPk } = dataGenerator.generateRandomKeyPair();
        const { publicKey: attacker1Pk } =
          dataGenerator.generateRandomKeyPair();
        const { publicKey: attacker2Pk } =
          dataGenerator.generateRandomKeyPair();

        const attacker1Payment = payments.p2tr({
          internalPubkey: toXOnly(Buffer.from(attacker1Pk, "hex")),
          network,
        });
        const attacker2Payment = payments.p2wpkh({
          pubkey: Buffer.from(attacker2Pk, "hex"),
          network,
        });
        const outputScripts = [
          attacker1Payment.output!,
          attacker2Payment.output!,
        ];

        const result = validateWithdrawalOutputs(
          outputScripts,
          userPk,
          network,
        );

        expect(result.isValid).toBe(false);
        expect(result.invalidAddresses).toHaveLength(2);
        expect(result.invalidAddresses).toContain(attacker1Payment.address);
        expect(result.invalidAddresses).toContain(attacker2Payment.address);
      });

      it("should return invalid when mixed valid and invalid outputs", () => {
        const { publicKey: userPk } = dataGenerator.generateRandomKeyPair();
        const { publicKey: attackerPk } = dataGenerator.generateRandomKeyPair();

        const userPkBuffer = Buffer.from(userPk, "hex");
        const validPayment = payments.p2tr({
          internalPubkey: toXOnly(userPkBuffer),
          network,
        });

        const attackerPkBuffer = Buffer.from(attackerPk, "hex");
        const invalidPayment = payments.p2tr({
          internalPubkey: toXOnly(attackerPkBuffer),
          network,
        });
        const outputScripts = [validPayment.output!, invalidPayment.output!];

        const result = validateWithdrawalOutputs(
          outputScripts,
          userPk,
          network,
        );

        expect(result.isValid).toBe(false);
        expect(result.invalidAddresses).toHaveLength(1);
        expect(result.invalidAddresses[0]).toBe(invalidPayment.address);
      });

      it("should skip OP_RETURN outputs", () => {
        const { publicKey } = dataGenerator.generateRandomKeyPair();
        const publicKeyBuffer = Buffer.from(publicKey, "hex");

        const validPayment = payments.p2tr({
          internalPubkey: toXOnly(publicKeyBuffer),
          network,
        });

        const opReturnScript = script.compile([
          script.OPS.OP_RETURN,
          Buffer.from("test data"),
        ]);

        const outputScripts = [validPayment.output!, opReturnScript];

        const result = validateWithdrawalOutputs(
          outputScripts,
          publicKey,
          network,
        );

        expect(result.isValid).toBe(true);
        expect(result.invalidAddresses).toHaveLength(0);
      });

      it("should return valid for empty output scripts array", () => {
        const { publicKey } = dataGenerator.generateRandomKeyPair();

        const result = validateWithdrawalOutputs([], publicKey, network);

        expect(result.isValid).toBe(true);
        expect(result.invalidAddresses).toHaveLength(0);
      });

      it("should detect P2PKH addresses as invalid (not allowed for withdrawals)", () => {
        const { publicKey: userPk } = dataGenerator.generateRandomKeyPair();
        const { publicKey: otherPk } = dataGenerator.generateRandomKeyPair();

        const p2pkhPayment = payments.p2pkh({
          pubkey: Buffer.from(otherPk, "hex"),
          network,
        });
        const outputScripts = [p2pkhPayment.output!];

        const result = validateWithdrawalOutputs(
          outputScripts,
          userPk,
          network,
        );

        expect(result.isValid).toBe(false);
        expect(result.invalidAddresses).toHaveLength(1);
      });

      it("should detect P2SH addresses as invalid (not allowed for withdrawals)", () => {
        const { publicKey: userPk } = dataGenerator.generateRandomKeyPair();
        const { publicKey: otherPk } = dataGenerator.generateRandomKeyPair();

        const p2shPayment = payments.p2sh({
          redeem: payments.p2wpkh({
            pubkey: Buffer.from(otherPk, "hex"),
            network,
          }),
          network,
        });
        const outputScripts = [p2shPayment.output!];

        const result = validateWithdrawalOutputs(
          outputScripts,
          userPk,
          network,
        );

        expect(result.isValid).toBe(false);
        expect(result.invalidAddresses).toHaveLength(1);
      });
    },
  );
});

describe("assertWithdrawalAddressesValid", () => {
  describe.each(testingNetworks)(
    "should assert validity on $networkName",
    ({ network, datagen: { stakingDatagen: dataGenerator } }) => {
      it("should not throw for valid P2TR output", () => {
        const { publicKey } = dataGenerator.generateRandomKeyPair();
        const publicKeyBuffer = Buffer.from(publicKey, "hex");

        const p2trPayment = payments.p2tr({
          internalPubkey: toXOnly(publicKeyBuffer),
          network,
        });
        const outputScripts = [p2trPayment.output!];

        expect(() =>
          assertWithdrawalAddressesValid(outputScripts, publicKey, network),
        ).not.toThrow();
      });

      it("should not throw for valid P2WPKH output", () => {
        const { publicKey } = dataGenerator.generateRandomKeyPair();
        const publicKeyBuffer = Buffer.from(publicKey, "hex");

        const p2wpkhPayment = payments.p2wpkh({
          pubkey: publicKeyBuffer,
          network,
        });
        const outputScripts = [p2wpkhPayment.output!];

        expect(() =>
          assertWithdrawalAddressesValid(outputScripts, publicKey, network),
        ).not.toThrow();
      });

      it("should throw StakingError with INVALID_OUTPUT code for invalid output", () => {
        const { publicKey: userPk } = dataGenerator.generateRandomKeyPair();
        const { publicKey: attackerPk } = dataGenerator.generateRandomKeyPair();

        const attackerPkBuffer = Buffer.from(attackerPk, "hex");
        const attackerPayment = payments.p2tr({
          internalPubkey: toXOnly(attackerPkBuffer),
          network,
        });
        const outputScripts = [attackerPayment.output!];

        expect(() =>
          assertWithdrawalAddressesValid(outputScripts, userPk, network),
        ).toThrow(StakingError);

        try {
          assertWithdrawalAddressesValid(outputScripts, userPk, network);
        } catch (error) {
          expect(error).toBeInstanceOf(StakingError);
          expect((error as StakingError).code).toBe(
            StakingErrorCode.INVALID_OUTPUT,
          );
          expect((error as StakingError).message).toContain(
            "Withdrawal address validation failed",
          );
          expect((error as StakingError).message).toContain(
            attackerPayment.address,
          );
        }
      });

      it("should include all invalid addresses in error message", () => {
        const { publicKey: userPk } = dataGenerator.generateRandomKeyPair();
        const { publicKey: attacker1Pk } =
          dataGenerator.generateRandomKeyPair();
        const { publicKey: attacker2Pk } =
          dataGenerator.generateRandomKeyPair();

        const attacker1Payment = payments.p2tr({
          internalPubkey: toXOnly(Buffer.from(attacker1Pk, "hex")),
          network,
        });
        const attacker2Payment = payments.p2wpkh({
          pubkey: Buffer.from(attacker2Pk, "hex"),
          network,
        });
        const outputScripts = [
          attacker1Payment.output!,
          attacker2Payment.output!,
        ];

        try {
          assertWithdrawalAddressesValid(outputScripts, userPk, network);
          fail("Expected error to be thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(StakingError);
          expect((error as StakingError).message).toContain(
            attacker1Payment.address!,
          );
          expect((error as StakingError).message).toContain(
            attacker2Payment.address!,
          );
        }
      });

      it("should not throw for outputs with only OP_RETURN", () => {
        const { publicKey } = dataGenerator.generateRandomKeyPair();

        const opReturnScript = script.compile([
          script.OPS.OP_RETURN,
          Buffer.from("test data"),
        ]);
        const outputScripts = [opReturnScript];

        expect(() =>
          assertWithdrawalAddressesValid(outputScripts, publicKey, network),
        ).not.toThrow();
      });

      it("should not throw for empty output scripts", () => {
        const { publicKey } = dataGenerator.generateRandomKeyPair();

        expect(() =>
          assertWithdrawalAddressesValid([], publicKey, network),
        ).not.toThrow();
      });
    },
  );
});

describe("cross-network validation", () => {
  const [mainnetConfig, testnetConfig] = testingNetworks;

  it("should validate same public key output across networks (script is network-agnostic)", () => {
    const { publicKey } =
      mainnetConfig.datagen.stakingDatagen.generateRandomKeyPair();
    const publicKeyBuffer = Buffer.from(publicKey, "hex");

    const p2tr = payments.p2tr({
      internalPubkey: toXOnly(publicKeyBuffer),
      network: networks.bitcoin,
    });

    const mainnetResult = validateWithdrawalOutputs(
      [p2tr.output!],
      publicKey,
      networks.bitcoin,
    );
    const testnetResult = validateWithdrawalOutputs(
      [p2tr.output!],
      publicKey,
      networks.testnet,
    );

    expect(mainnetResult.isValid).toBe(true);
    expect(testnetResult.isValid).toBe(true);
  });

  it("should reject different public key output regardless of network", () => {
    const { publicKey: userPk } =
      mainnetConfig.datagen.stakingDatagen.generateRandomKeyPair();
    const { publicKey: attackerPk } =
      testnetConfig.datagen.stakingDatagen.generateRandomKeyPair();

    const attackerP2tr = payments.p2tr({
      internalPubkey: toXOnly(Buffer.from(attackerPk, "hex")),
      network: networks.bitcoin,
    });

    const mainnetResult = validateWithdrawalOutputs(
      [attackerP2tr.output!],
      userPk,
      networks.bitcoin,
    );
    const testnetResult = validateWithdrawalOutputs(
      [attackerP2tr.output!],
      userPk,
      networks.testnet,
    );

    expect(mainnetResult.isValid).toBe(false);
    expect(testnetResult.isValid).toBe(false);
  });

  it("should validate correctly when network matches", () => {
    const { publicKey } =
      testnetConfig.datagen.stakingDatagen.generateRandomKeyPair();
    const publicKeyBuffer = Buffer.from(publicKey, "hex");

    const testnetP2tr = payments.p2tr({
      internalPubkey: toXOnly(publicKeyBuffer),
      network: networks.testnet,
    });

    const result = validateWithdrawalOutputs(
      [testnetP2tr.output!],
      publicKey,
      networks.testnet,
    );

    expect(result.isValid).toBe(true);
  });
});
