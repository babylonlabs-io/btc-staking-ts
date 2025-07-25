import { sha256 } from "bitcoinjs-lib/src/crypto";

import {
  createStakerPopContext,
  getPopMessageToSignFormat,
  createPopMessageToSign,
  PopUpgradeConfig,
  BabylonPopProvider,
} from "../../src/utils/pop";
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

  describe("determinePopMessageFormat", () => {
    const mockUpgradeConfig: PopUpgradeConfig = {
      upgradeBabyHeight: 200,
      version: 0,
    };

    describe("Legacy Format", () => {
      it("should return bech32 address when no upgrade config provided", () => {
        const result = getPopMessageToSignFormat(
          300,
          mockBech32Address,
          mockChainId,
        );

        expect(result).toBe(mockBech32Address);
      });

      it("should return bech32 address when current height is below upgrade height", () => {
        const result = getPopMessageToSignFormat(
          100,
          mockBech32Address,
          mockChainId,
          mockUpgradeConfig,
        );

        expect(result).toBe(mockBech32Address);
      });

      it("should return bech32 address when upgrade height is undefined", () => {
        const config = { ...mockUpgradeConfig };
        delete (config as any).upgradeBabyHeight;

        const result = getPopMessageToSignFormat(
          300,
          mockBech32Address,
          mockChainId,
          config,
        );

        expect(result).toBe(mockBech32Address);
      });
    });

    describe("New Format", () => {
      it("should return context hash + address when current height equals upgrade height", () => {
        const result = getPopMessageToSignFormat(
          200,
          mockBech32Address,
          mockChainId,
          mockUpgradeConfig,
        );

        const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
        const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
        const expectedMessage = expectedContextHash + mockBech32Address;

        expect(result).toBe(expectedMessage);
      });

      it("should return context hash + address when current height is above upgrade height", () => {
        const result = getPopMessageToSignFormat(
          300,
          mockBech32Address,
          mockChainId,
          mockUpgradeConfig,
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

        const result = getPopMessageToSignFormat(
          300,
          mockBech32Address,
          mockChainId,
          customConfig,
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

        const result = getPopMessageToSignFormat(
          100,
          mockBech32Address,
          mockChainId,
          config,
        );

        const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
        const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
        const expectedMessage = expectedContextHash + mockBech32Address;

        expect(result).toBe(expectedMessage);
      });
    });

    describe("Edge Cases", () => {
      it("should handle empty bech32 address", () => {
        const result = getPopMessageToSignFormat(
          300,
          "",
          mockChainId,
          mockUpgradeConfig,
        );

        const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
        const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
        const expectedMessage = expectedContextHash + "";

        expect(result).toBe(expectedMessage);
      });

      it("should handle very large height values", () => {
        const result = getPopMessageToSignFormat(
          Number.MAX_SAFE_INTEGER,
          mockBech32Address,
          mockChainId,
          mockUpgradeConfig,
        );

        const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
        const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
        const expectedMessage = expectedContextHash + mockBech32Address;

        expect(result).toBe(expectedMessage);
      });

      it("should handle empty chain ID", () => {
        const result = getPopMessageToSignFormat(
          300,
          mockBech32Address,
          "",
          mockUpgradeConfig,
        );

        const expectedContextString = `btcstaking/0/staker_pop//${STAKING_MODULE_ADDRESS}`;
        const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
        const expectedMessage = expectedContextHash + mockBech32Address;

        expect(result).toBe(expectedMessage);
      });
    });
  });

  describe("createPopMessageToSign", () => {
    let mockProvider: jest.Mocked<BabylonPopProvider>;

    beforeEach(() => {
      mockProvider = {
        getCurrentHeight: jest.fn(),
        getChainId: jest.fn(),
      };
    });

    describe("Success Cases", () => {
      it("should return legacy format when no upgrade config provided", async () => {
        mockProvider.getCurrentHeight.mockResolvedValue(300);
        mockProvider.getChainId.mockResolvedValue(mockChainId);

        const result = await createPopMessageToSign(
          mockBech32Address,
          mockProvider,
        );

        expect(result).toBe(mockBech32Address);
        expect(mockProvider.getCurrentHeight).toHaveBeenCalledTimes(1);
        expect(mockProvider.getChainId).toHaveBeenCalledTimes(1);
      });

      it("should return legacy format when height is below upgrade height", async () => {
        const upgradeConfig: PopUpgradeConfig = {
          upgradeBabyHeight: 200,
          version: 0,
        };

        mockProvider.getCurrentHeight.mockResolvedValue(100);
        mockProvider.getChainId.mockResolvedValue(mockChainId);

        const result = await createPopMessageToSign(
          mockBech32Address,
          mockProvider,
          upgradeConfig,
        );

        expect(result).toBe(mockBech32Address);
        expect(mockProvider.getCurrentHeight).toHaveBeenCalledTimes(1);
        expect(mockProvider.getChainId).toHaveBeenCalledTimes(1);
      });

      it("should return new format when height is above upgrade height", async () => {
        const upgradeConfig: PopUpgradeConfig = {
          upgradeBabyHeight: 200,
          version: 0,
        };

        mockProvider.getCurrentHeight.mockResolvedValue(300);
        mockProvider.getChainId.mockResolvedValue(mockChainId);

        const result = await createPopMessageToSign(
          mockBech32Address,
          mockProvider,
          upgradeConfig,
        );

        const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
        const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
        const expectedMessage = expectedContextHash + mockBech32Address;

        expect(result).toBe(expectedMessage);
        expect(mockProvider.getCurrentHeight).toHaveBeenCalledTimes(1);
        expect(mockProvider.getChainId).toHaveBeenCalledTimes(1);
      });

      it("should use custom version when provided", async () => {
        const upgradeConfig: PopUpgradeConfig = {
          upgradeBabyHeight: 200,
          version: 1,
        };

        mockProvider.getCurrentHeight.mockResolvedValue(300);
        mockProvider.getChainId.mockResolvedValue(mockChainId);

        const result = await createPopMessageToSign(
          mockBech32Address,
          mockProvider,
          upgradeConfig,
        );

        const expectedContextString = `btcstaking/1/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
        const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
        const expectedMessage = expectedContextHash + mockBech32Address;

        expect(result).toBe(expectedMessage);
      });
    });

    describe("Error Handling", () => {
      it("should throw error when getCurrentHeight fails", async () => {
        const upgradeConfig: PopUpgradeConfig = {
          upgradeBabyHeight: 200,
          version: 0,
        };

        mockProvider.getCurrentHeight.mockRejectedValue(new Error("Network error"));

        await expect(
          createPopMessageToSign(mockBech32Address, mockProvider, upgradeConfig)
        ).rejects.toThrow("Failed to get current height for POP context: Network error");

        expect(mockProvider.getCurrentHeight).toHaveBeenCalledTimes(1);
        expect(mockProvider.getChainId).not.toHaveBeenCalled();
      });

      it("should throw error when getChainId fails", async () => {
        const upgradeConfig: PopUpgradeConfig = {
          upgradeBabyHeight: 200,
          version: 0,
        };

        mockProvider.getCurrentHeight.mockResolvedValue(300);
        mockProvider.getChainId.mockRejectedValue(new Error("Chain ID error"));

        await expect(
          createPopMessageToSign(mockBech32Address, mockProvider, upgradeConfig)
        ).rejects.toThrow("Chain ID error");

        expect(mockProvider.getCurrentHeight).toHaveBeenCalledTimes(1);
        expect(mockProvider.getChainId).toHaveBeenCalledTimes(1);
      });

      it("should handle non-Error objects thrown by getCurrentHeight", async () => {
        const upgradeConfig: PopUpgradeConfig = {
          upgradeBabyHeight: 200,
          version: 0,
        };

        mockProvider.getCurrentHeight.mockRejectedValue("String error");

        await expect(
          createPopMessageToSign(mockBech32Address, mockProvider, upgradeConfig)
        ).rejects.toThrow("Failed to get current height for POP context: String error");
      });

      it("should handle non-Error objects thrown by getChainId", async () => {
        const upgradeConfig: PopUpgradeConfig = {
          upgradeBabyHeight: 200,
          version: 0,
        };

        mockProvider.getCurrentHeight.mockResolvedValue(300);
        mockProvider.getChainId.mockRejectedValue("Chain ID string error");

        let thrownError: any;
        try {
          await createPopMessageToSign(mockBech32Address, mockProvider, upgradeConfig);
        } catch (error) {
          thrownError = error;
        }

        expect(thrownError).toBe("Chain ID string error");
        expect(mockProvider.getCurrentHeight).toHaveBeenCalledTimes(1);
        expect(mockProvider.getChainId).toHaveBeenCalledTimes(1);
      });
    });

    describe("Edge Cases", () => {
      it("should handle empty bech32 address", async () => {
        mockProvider.getCurrentHeight.mockResolvedValue(100);
        mockProvider.getChainId.mockResolvedValue(mockChainId);

        const result = await createPopMessageToSign(
          "",
          mockProvider,
        );

        expect(result).toBe("");
      });

      it("should handle zero height", async () => {
        const upgradeConfig: PopUpgradeConfig = {
          upgradeBabyHeight: 0,
          version: 0,
        };

        mockProvider.getCurrentHeight.mockResolvedValue(0);
        mockProvider.getChainId.mockResolvedValue(mockChainId);

        const result = await createPopMessageToSign(
          mockBech32Address,
          mockProvider,
          upgradeConfig,
        );

        // Should use new format since height (0) >= upgrade height (0)
        const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
        const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
        const expectedMessage = expectedContextHash + mockBech32Address;

        expect(result).toBe(expectedMessage);
      });

      it("should handle very large height values", async () => {
        const upgradeConfig: PopUpgradeConfig = {
          upgradeBabyHeight: 1000,
          version: 0,
        };

        mockProvider.getCurrentHeight.mockResolvedValue(Number.MAX_SAFE_INTEGER);
        mockProvider.getChainId.mockResolvedValue(mockChainId);

        const result = await createPopMessageToSign(
          mockBech32Address,
          mockProvider,
          upgradeConfig,
        );

        const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
        const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
        const expectedMessage = expectedContextHash + mockBech32Address;

        expect(result).toBe(expectedMessage);
      });
    });
  });
});