import { networks } from "bitcoinjs-lib";
import { sha256 } from "bitcoinjs-lib/src/crypto";

import { BabylonBtcStakingManager } from "../../../src/staking/manager";
import { STAKING_MODULE_ADDRESS } from "../../../src/constants/staking";

import { babylonProvider, btcProvider } from "./__mock__/providers";
import { params, stakerInfo } from "./__mock__/staking";
import { babylonAddress } from "./__mock__/fee";

describe("Staking Manager - POP Upgrade", () => {
  const mockChainId = "bbn-1";
  const mockBech32Address = babylonAddress;
  const mockBtcAddress = stakerInfo.address;

  beforeEach(() => {
    jest.clearAllMocks();
    btcProvider.signMessage.mockResolvedValue("mocked-signature");
    babylonProvider.getChainId.mockResolvedValue(mockChainId);
  });

  describe("createPopMessageToSign - Direct Tests", () => {
    describe("Legacy Format (Below Upgrade Height)", () => {
      it("should return just bech32 address when popUpgradeHeight is undefined", async () => {
        const manager = new BabylonBtcStakingManager(
          networks.bitcoin,
          params,
          btcProvider,
          babylonProvider,
        );

        const message = await (manager as any).createPopMessageToSign(mockBech32Address);
        expect(message).toBe(mockBech32Address);
      });

      it("should return just bech32 address when current height is below upgrade height", async () => {
        const mockGetCurrentHeight = jest.fn().mockResolvedValue(100);
        babylonProvider.getCurrentHeight.mockImplementation(mockGetCurrentHeight);
        
        const manager = new BabylonBtcStakingManager(
          networks.bitcoin,
          params,
          btcProvider,
          babylonProvider,
          undefined,
          {
            popUpgradeHeight: 200,
            popVersion: 0,
          },
        );

        const message = await (manager as any).createPopMessageToSign(mockBech32Address);
        
        expect(message).toBe(mockBech32Address);
        expect(mockGetCurrentHeight).toHaveBeenCalled();
      });

      it("should return context hash + bech32 address when current height equals upgrade height", async () => {
        const mockGetCurrentHeight = jest.fn().mockResolvedValue(200);
        babylonProvider.getCurrentHeight.mockImplementation(mockGetCurrentHeight);
        
        const manager = new BabylonBtcStakingManager(
          networks.bitcoin,
          params,
          btcProvider,
          babylonProvider,
          undefined,
          {
            popUpgradeHeight: 200,
            popVersion: 0,
          },
        );

        const message = await (manager as any).createPopMessageToSign(mockBech32Address);
        
        // Calculate expected context hash (should use new format when height >= upgrade height)
        const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
        const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
        const expectedMessage = expectedContextHash + mockBech32Address;
        
        expect(message).toBe(expectedMessage);
        expect(mockGetCurrentHeight).toHaveBeenCalled();
        expect(babylonProvider.getChainId).toHaveBeenCalled();
      });
    });

    describe("New Format (Above Upgrade Height)", () => {
      it("should return context hash + bech32 address when current height is above upgrade height", async () => {
        const mockGetCurrentHeight = jest.fn().mockResolvedValue(300);
        babylonProvider.getCurrentHeight.mockImplementation(mockGetCurrentHeight);
        
        const manager = new BabylonBtcStakingManager(
          networks.bitcoin,
          params,
          btcProvider,
          babylonProvider,
          undefined,
          {
            popUpgradeHeight: 200,
            popVersion: 0,
          },
        );

        const message = await (manager as any).createPopMessageToSign(mockBech32Address);
        
        // Calculate expected context hash
        const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
        const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
        const expectedMessage = expectedContextHash + mockBech32Address;
        
        expect(message).toBe(expectedMessage);
        expect(mockGetCurrentHeight).toHaveBeenCalled();
        expect(babylonProvider.getChainId).toHaveBeenCalled();
      });

      it("should return context hash + bech32 address when popContextUpgradeHeight is 0", async () => {
        const mockGetCurrentHeight = jest.fn().mockResolvedValue(100);
        babylonProvider.getCurrentHeight.mockImplementation(mockGetCurrentHeight);
        
        const manager = new BabylonBtcStakingManager(
          networks.bitcoin,
          params,
          btcProvider,
          babylonProvider,
          undefined,
          {
            popUpgradeHeight: 0,
            popVersion: 0,
          },
        );

        const message = await (manager as any).createPopMessageToSign(mockBech32Address);
        
        // Calculate expected context hash
        const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
        const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
        const expectedMessage = expectedContextHash + mockBech32Address;
        
        expect(message).toBe(expectedMessage);
        expect(mockGetCurrentHeight).toHaveBeenCalled();
        expect(babylonProvider.getChainId).toHaveBeenCalled();
      });

      it("should use custom popContextVersion when provided", async () => {
        const mockGetCurrentHeight = jest.fn().mockResolvedValue(300);
        babylonProvider.getCurrentHeight.mockImplementation(mockGetCurrentHeight);
        
        const manager = new BabylonBtcStakingManager(
          networks.bitcoin,
          params,
          btcProvider,
          babylonProvider,
          undefined,
          {
            popUpgradeHeight: 200,
            popVersion: 1,
          },
        );

        const message = await (manager as any).createPopMessageToSign(mockBech32Address);
        
        // Calculate expected context hash with version 1
        const expectedContextString = `btcstaking/1/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
        const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
        const expectedMessage = expectedContextHash + mockBech32Address;
        
        expect(message).toBe(expectedMessage);
        expect(mockGetCurrentHeight).toHaveBeenCalled();
        expect(babylonProvider.getChainId).toHaveBeenCalled();
      });
    });

    describe("Error Handling", () => {
      it("should throw error when getCurrentHeight fails", async () => {
        const mockGetCurrentHeight = jest
          .fn()
          .mockRejectedValue(new Error("Network error"));
        babylonProvider.getCurrentHeight.mockImplementation(mockGetCurrentHeight);

        const manager = new BabylonBtcStakingManager(
          networks.bitcoin,
          params,
          btcProvider,
          babylonProvider,
          undefined,
          {
            popUpgradeHeight: 200,
            popVersion: 0,
          },
        );

        await expect(
          (manager as any).createPopMessageToSign(mockBech32Address)
        ).rejects.toThrow("Failed to get current height for POP context: Network error");
      });

      it("should throw error when getChainId fails", async () => {
        const mockGetCurrentHeight = jest.fn().mockResolvedValue(300);
        babylonProvider.getCurrentHeight.mockImplementation(mockGetCurrentHeight);
        babylonProvider.getChainId.mockRejectedValue(new Error("Chain ID error"));

        const manager = new BabylonBtcStakingManager(
          networks.bitcoin,
          params,
          btcProvider,
          babylonProvider,
          undefined,
          {
            popUpgradeHeight: 200,
            popVersion: 0,
          },
        );

        await expect(
          (manager as any).createPopMessageToSign(mockBech32Address)
        ).rejects.toThrow("Chain ID error");
      });

      it("should handle non-Error objects thrown by getCurrentHeight", async () => {
        const mockGetCurrentHeight = jest
          .fn()
          .mockRejectedValue("String error");
        babylonProvider.getCurrentHeight.mockImplementation(mockGetCurrentHeight);

        const manager = new BabylonBtcStakingManager(
          networks.bitcoin,
          params,
          btcProvider,
          babylonProvider,
          undefined,
          {
            popUpgradeHeight: 200,
            popVersion: 0,
          },
        );

        await expect(
          (manager as any).createPopMessageToSign(mockBech32Address)
        ).rejects.toThrow("Failed to get current height for POP context: String error");
      });
    });

    describe("Edge Cases", () => {
      it("should handle empty bech32 address", async () => {
        const manager = new BabylonBtcStakingManager(
          networks.bitcoin,
          params,
          btcProvider,
          babylonProvider,
        );

        const message = await (manager as any).createPopMessageToSign("");
        expect(message).toBe("");
      });

      it("should handle very large height values", async () => {
        const mockGetCurrentHeight = jest.fn().mockResolvedValue(Number.MAX_SAFE_INTEGER);
        babylonProvider.getCurrentHeight.mockImplementation(mockGetCurrentHeight);
        
        const manager = new BabylonBtcStakingManager(
          networks.bitcoin,
          params,
          btcProvider,
          babylonProvider,
          undefined,
          {
            popUpgradeHeight: 1000,
            popVersion: 0,
          },
        );

        const message = await (manager as any).createPopMessageToSign(mockBech32Address);
        
        // Should use new format since current height > upgrade height
        const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
        const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
        const expectedMessage = expectedContextHash + mockBech32Address;
        
        expect(message).toBe(expectedMessage);
      });
    });
  });

  describe("Context String Generation", () => {
    it("should generate correct context hash", async () => {
      const manager = new BabylonBtcStakingManager(
        networks.bitcoin,
        params,
        btcProvider,
        babylonProvider,
        undefined,
        {
          popUpgradeHeight: 0,
        },
      );

      // Access private method through type assertion for testing
      const contextHash = await (manager as any).createStakerPopContext(mockChainId, 0);

      // Expected context string: btcstaking/0/staker_pop/bbn-1/bbn13837feaxn8t0zvwcjwhw7lhpgdcx4s36eqteah
      const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
      const expectedHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");

      expect(contextHash).toBe(expectedHash);
    });

    it("should generate correct context hash with custom version", async () => {
      const manager = new BabylonBtcStakingManager(
        networks.bitcoin,
        params,
        btcProvider,
        babylonProvider,
        undefined,
        {
          popUpgradeHeight: 0,
        },
      );

      // Access private method through type assertion for testing
      const contextHash = await (manager as any).createStakerPopContext(mockChainId, 1);

      // Expected context string: btcstaking/1/staker_pop/bbn-1/bbn13837feaxn8t0zvwcjwhw7lhpgdcx4s36eqteah
      const expectedContextString = `btcstaking/1/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
      const expectedHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");

      expect(contextHash).toBe(expectedHash);
    });
  });

  describe("Legacy POP Format (Below Upgrade Height)", () => {
    it("should use legacy format when height is below upgrade height", async () => {
      const mockGetCurrentHeight = jest.fn().mockResolvedValue(100);
      babylonProvider.getCurrentHeight.mockImplementation(mockGetCurrentHeight);
      
      const manager = new BabylonBtcStakingManager(
        networks.bitcoin,
        params,
        btcProvider,
        babylonProvider,
        undefined,
        {
          popUpgradeHeight: 200,
        },
      );

      await manager.createProofOfPossession(
        "delegation:create",
        mockBech32Address,
        mockBtcAddress,
      );

      // Should sign just the bech32 address (legacy format)
      expect(btcProvider.signMessage).toHaveBeenCalledWith(
        mockBech32Address,
        "ecdsa",
      );
      expect(mockGetCurrentHeight).toHaveBeenCalled();
    });

    it("should use legacy format when no upgrade options provided", async () => {
      const manager = new BabylonBtcStakingManager(
        networks.bitcoin,
        params,
        btcProvider,
        babylonProvider,
      );

      await manager.createProofOfPossession(
        "delegation:create",
        mockBech32Address,
        mockBtcAddress,
      );

      // Should sign just the bech32 address (legacy format)
      expect(btcProvider.signMessage).toHaveBeenCalledWith(
        mockBech32Address,
        "ecdsa",
      );
    });
  });

  describe("New POP Format (Above Upgrade Height)", () => {
    it("should use new format when height is above upgrade height", async () => {
      const mockGetCurrentHeight = jest.fn().mockResolvedValue(300);
      babylonProvider.getCurrentHeight.mockImplementation(mockGetCurrentHeight);
      
      const manager = new BabylonBtcStakingManager(
        networks.bitcoin,
        params,
        btcProvider,
        babylonProvider,
        undefined,
        {
          popUpgradeHeight: 200,
          popVersion: 0,
        },
      );

      await manager.createProofOfPossession(
        "delegation:create",
        mockBech32Address,
        mockBtcAddress,
      );

      // Calculate expected message with context hash
      const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
      const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
      const expectedMessage = expectedContextHash + mockBech32Address;

      expect(btcProvider.signMessage).toHaveBeenCalledWith(
        expectedMessage,
        "ecdsa",
      );
      expect(mockGetCurrentHeight).toHaveBeenCalled();
    });

    it("should use new format when popContextUpgradeHeight is 0 (always use new format)", async () => {
      const mockGetCurrentHeight = jest.fn().mockResolvedValue(100);
      babylonProvider.getCurrentHeight.mockImplementation(mockGetCurrentHeight);
      
      const manager = new BabylonBtcStakingManager(
        networks.bitcoin,
        params,
        btcProvider,
        babylonProvider,
        undefined,
        {
          popUpgradeHeight: 0,
          popVersion: 0,
        },
      );

      await manager.createProofOfPossession(
        "delegation:create",
        mockBech32Address,
        mockBtcAddress,
      );

      // Calculate expected message with context hash
      const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
      const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
      const expectedMessage = expectedContextHash + mockBech32Address;

      expect(btcProvider.signMessage).toHaveBeenCalledWith(
        expectedMessage,
        "ecdsa",
      );
    });
  });

  describe("Error Handling", () => {
    it("should throw error when height detection fails", async () => {
      const mockGetCurrentHeight = jest
        .fn()
        .mockRejectedValue(new Error("Network error"));
      babylonProvider.getCurrentHeight.mockImplementation(mockGetCurrentHeight);

      const manager = new BabylonBtcStakingManager(
        networks.bitcoin,
        params,
        btcProvider,
        babylonProvider,
        undefined,
        {
          popUpgradeHeight: 200,
          popVersion: 0,
        },
      );

      await expect(
        manager.createProofOfPossession(
          "delegation:create",
          mockBech32Address,
          mockBtcAddress,
        ),
      ).rejects.toThrow("Failed to get current height for POP context: Network error");
    });
  });

  describe("BIP322 Support", () => {
    it("should use BIP322 signature for taproot addresses with new format", async () => {
      const mockTaprootAddress =
        "bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297";
      const mockGetCurrentHeight = jest.fn().mockResolvedValue(300);
      babylonProvider.getCurrentHeight.mockImplementation(mockGetCurrentHeight);
      
      const manager = new BabylonBtcStakingManager(
        networks.bitcoin,
        params,
        btcProvider,
        babylonProvider,
        undefined,
        {
          popUpgradeHeight: 200,
          popVersion: 0,
        },
      );

      await manager.createProofOfPossession(
        "delegation:create",
        mockBech32Address,
        mockTaprootAddress,
      );

      // Calculate expected message with context hash
      const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${STAKING_MODULE_ADDRESS}`;
      const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
      const expectedMessage = expectedContextHash + mockBech32Address;

      expect(btcProvider.signMessage).toHaveBeenCalledWith(
        expectedMessage,
        "bip322-simple",
      );
    });
  });
});