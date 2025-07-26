import { sha256 } from "bitcoinjs-lib/src/crypto";

import {
  createStakerPopContext,
  buildPopMessage,
  createPopMessageToSign,
} from "../../src/utils/pop";
import { PopUpgradeConfig } from "../../src/types";
import { STAKING_MODULE_ADDRESS } from "../../src/constants/staking";
import { babylonAddress } from "../staking/manager/__mock__/fee";
import { mockChainId } from "../staking/manager/__mock__/providers";

describe("POP Utility Functions", () => {
  const mockBech32Address = babylonAddress;

  describe("createStakerPopContext", () => {
    it("should generate correct context hash with default version", () => {
      const contextHash = createStakerPopContext(mockChainId);

      const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
      const expectedHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");

      expect(contextHash).toBe(expectedHash);
    });

    it("should generate correct context hash with custom version", () => {
      const contextHash = createStakerPopContext(mockChainId, 1);

      const expectedContextString = `btcstaking/1/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
      const expectedHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");

      expect(contextHash).toBe(expectedHash);
    });

    it("should generate correct context hash with version 2", () => {
      const contextHash = createStakerPopContext(mockChainId, 2);

      const expectedContextString = `btcstaking/2/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
      const expectedHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");

      expect(contextHash).toBe(expectedHash);
    });

    it("should handle empty chain ID", () => {
      const contextHash = createStakerPopContext("");

      const expectedContextString = `btcstaking/0/staker_pop//${STAKING_MODULE_ADDRESS}`;
      const expectedHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");

      expect(contextHash).toBe(expectedHash);
    });
  });

  describe("buildPopMessage", () => {
    const mockUpgradeConfig: PopUpgradeConfig = {
      upgradeBabyHeight: 200,
      version: 0,
    };

    describe("Legacy Format", () => {
      it("should return bech32 address when no upgrade config provided", () => {
        const result = buildPopMessage(
          300,
          mockBech32Address,
          mockChainId,
        );

        expect(result).toBe(mockBech32Address);
      });

      it("should return bech32 address when current height is below upgrade height", () => {
        const result = buildPopMessage(
          100,
          mockBech32Address,
          mockChainId,
          mockUpgradeConfig.upgradeBabyHeight,
          mockUpgradeConfig.version,
        );

        expect(result).toBe(mockBech32Address);
      });

      it("should return bech32 address when upgrade height is undefined", () => {
        const config = { ...mockUpgradeConfig };
        delete (config as any).upgradeBabyHeight;

        const result = buildPopMessage(
          300,
          mockBech32Address,
          mockChainId,
          config.upgradeBabyHeight,
          config.version,
        );

        expect(result).toBe(mockBech32Address);
      });
    });

    describe("New Format", () => {
      it("should return context hash + address when current height equals upgrade height", () => {
        const result = buildPopMessage(
          200,
          mockBech32Address,
          mockChainId,
          mockUpgradeConfig.upgradeBabyHeight,
          mockUpgradeConfig.version,
        );

        const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
        const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
        const expectedMessage = expectedContextHash + mockBech32Address;

        expect(result).toBe(expectedMessage);
      });

      it("should return context hash + address when current height is above upgrade height", () => {
        const result = buildPopMessage(
          300,
          mockBech32Address,
          mockChainId,
          mockUpgradeConfig.upgradeBabyHeight,
          mockUpgradeConfig.version,
        );

        const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
        const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
        const expectedMessage = expectedContextHash + mockBech32Address;

        expect(result).toBe(expectedMessage);
      });

      it("should use custom version when provided", () => {
        const customConfig: PopUpgradeConfig = {
          upgradeBabyHeight: 200,
          version: 1,
        };

        const result = buildPopMessage(
          300,
          mockBech32Address,
          mockChainId,
          customConfig.upgradeBabyHeight,
          customConfig.version,
        );

        const expectedContextString = `btcstaking/1/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
        const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
        const expectedMessage = expectedContextHash + mockBech32Address;

        expect(result).toBe(expectedMessage);
      });

      it("should always use new format when upgrade height is 0", () => {
        const config: PopUpgradeConfig = {
          upgradeBabyHeight: 0,
          version: 0,
        };

        const result = buildPopMessage(
          100,
          mockBech32Address,
          mockChainId,
          config.upgradeBabyHeight,
          config.version,
        );

        const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
        const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
        const expectedMessage = expectedContextHash + mockBech32Address;

        expect(result).toBe(expectedMessage);
      });
    });

    describe("Edge Cases", () => {
      it("should handle empty bech32 address", () => {
        const result = buildPopMessage(
          300,
          "",
          mockChainId,
          mockUpgradeConfig.upgradeBabyHeight,
          mockUpgradeConfig.version,
        );

        const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
        const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
        const expectedMessage = expectedContextHash + "";

        expect(result).toBe(expectedMessage);
      });

      it("should handle very large height values", () => {
        const result = buildPopMessage(
          Number.MAX_SAFE_INTEGER,
          mockBech32Address,
          mockChainId,
          mockUpgradeConfig.upgradeBabyHeight,
          mockUpgradeConfig.version,
        );

        const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
        const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
        const expectedMessage = expectedContextHash + mockBech32Address;

        expect(result).toBe(expectedMessage);
      });

      it("should handle empty chain ID", () => {
        const result = buildPopMessage(
          300,
          mockBech32Address,
          "",
          mockUpgradeConfig.upgradeBabyHeight,
          mockUpgradeConfig.version,
        );

        const expectedContextString = `btcstaking/0/staker_pop//${STAKING_MODULE_ADDRESS}`;
        const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
        const expectedMessage = expectedContextHash + mockBech32Address;

        expect(result).toBe(expectedMessage);
      });
    });
  });

  describe("createPopMessageToSign", () => {
    describe("Success Cases", () => {
      it("should return legacy format when no upgrade config provided", () => {
        const result = createPopMessageToSign(
          mockBech32Address,
          mockChainId,
          300,
        );

        expect(result).toBe(mockBech32Address);
      });

      it("should return legacy format when height is below upgrade height", () => {
        const result = createPopMessageToSign(
          mockBech32Address,
          mockChainId,
          100,
          200, // upgradeBabyHeight
          0,   // version
        );

        expect(result).toBe(mockBech32Address);
      });

      it("should return new format when height is above upgrade height", () => {
        const result = createPopMessageToSign(
          mockBech32Address,
          mockChainId,
          300,
          200, // upgradeBabyHeight
          0,   // version
        );

        const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
        const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
        const expectedMessage = expectedContextHash + mockBech32Address;

        expect(result).toBe(expectedMessage);
      });

      it("should use custom version when provided", () => {
        const result = createPopMessageToSign(
          mockBech32Address,
          mockChainId,
          300,
          200, // upgradeBabyHeight
          1,   // version
        );

        const expectedContextString = `btcstaking/1/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
        const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
        const expectedMessage = expectedContextHash + mockBech32Address;

        expect(result).toBe(expectedMessage);
      });
    });

    describe("Edge Cases", () => {
      it("should handle empty bech32 address", () => {
        const result = createPopMessageToSign(
          "",
          mockChainId,
          100,
        );

        expect(result).toBe("");
      });

      it("should handle zero height", () => {
        const result = createPopMessageToSign(
          mockBech32Address,
          mockChainId,
          0,
          0, // upgradeBabyHeight
          0, // version
        );

        // Should use new format since height (0) >= upgrade height (0)
        const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
        const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
        const expectedMessage = expectedContextHash + mockBech32Address;

        expect(result).toBe(expectedMessage);
      });

      it("should handle very large height values", () => {
        const result = createPopMessageToSign(
          mockBech32Address,
          mockChainId,
          Number.MAX_SAFE_INTEGER,
          1000, // upgradeBabyHeight
          0,    // version
        );

        const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
        const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
        const expectedMessage = expectedContextHash + mockBech32Address;

        expect(result).toBe(expectedMessage);
      });
    });
  });
});