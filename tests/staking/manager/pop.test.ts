import { networks } from "bitcoinjs-lib";
import { sha256 } from "bitcoinjs-lib/src/crypto";

import { BabylonBtcStakingManager } from "../../../src/staking/manager";

import { babylonProvider, btcProvider } from "./__mock__/providers";
import { params } from "./__mock__/staking";

describe("Staking Manager - POP Upgrade", () => {
  const mockChainId = "bbn-1";
  const mockStakingModuleAddress = "bbn13837feaxn8t0zvwcjwhw7lhpgdcx4s36eqteah";
  const mockBech32Address = "bbn1testaddress";
  const mockBtcAddress = "bc1qtest";

  beforeEach(() => {
    jest.clearAllMocks();
    btcProvider.signMessage.mockResolvedValue("mocked-signature");
  });

  describe("Context String Generation", () => {
    it("should generate correct context hash", () => {
      const manager = new BabylonBtcStakingManager(
        networks.bitcoin,
        params,
        btcProvider,
        babylonProvider,
        undefined,
        {
          chainId: mockChainId,
          stakingModuleAddress: mockStakingModuleAddress,
          popUpgradeHeight: 0,
        },
      );

      // Access private method through type assertion for testing
      const contextHash = (manager as any).createStakerPopContext();

      // Expected context string: btcstaking/0/staker_pop/bbn-1/bbn13837feaxn8t0zvwcjwhw7lhpgdcx4s36eqteah
      const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${mockStakingModuleAddress}`;
      const expectedHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");

      expect(contextHash).toBe(expectedHash);
    });

    it("should throw error when chainId is missing", () => {
      const manager = new BabylonBtcStakingManager(
        networks.bitcoin,
        params,
        btcProvider,
        babylonProvider,
        undefined,
        {
          stakingModuleAddress: mockStakingModuleAddress,
        },
      );

      expect(() => {
        (manager as any).createStakerPopContext();
      }).toThrow(
        "chainId and stakingModuleAddress required for context generation",
      );
    });

    it("should throw error when stakingModuleAddress is missing", () => {
      const manager = new BabylonBtcStakingManager(
        networks.bitcoin,
        params,
        btcProvider,
        babylonProvider,
        undefined,
        {
          chainId: mockChainId,
        },
      );

      expect(() => {
        (manager as any).createStakerPopContext();
      }).toThrow(
        "chainId and stakingModuleAddress required for context generation",
      );
    });
  });

  describe("Legacy POP Format (Below Upgrade Height)", () => {
    it("should use legacy format when height is below upgrade height", async () => {
      const mockGetCurrentHeight = jest.fn().mockResolvedValue(100);
      
      const manager = new BabylonBtcStakingManager(
        networks.bitcoin,
        params,
        btcProvider,
        babylonProvider,
        undefined,
        {
          chainId: mockChainId,
          stakingModuleAddress: mockStakingModuleAddress,
          popUpgradeHeight: 200,
          getCurrentHeight: mockGetCurrentHeight,
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
      
      const manager = new BabylonBtcStakingManager(
        networks.bitcoin,
        params,
        btcProvider,
        babylonProvider,
        undefined,
        {
          chainId: mockChainId,
          stakingModuleAddress: mockStakingModuleAddress,
          popUpgradeHeight: 200,
          getCurrentHeight: mockGetCurrentHeight,
        },
      );

      await manager.createProofOfPossession(
        "delegation:create",
        mockBech32Address,
        mockBtcAddress,
      );

      // Calculate expected message with context hash
      const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${mockStakingModuleAddress}`;
      const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
      const expectedMessage = expectedContextHash + mockBech32Address;

      expect(btcProvider.signMessage).toHaveBeenCalledWith(
        expectedMessage,
        "ecdsa",
      );
      expect(mockGetCurrentHeight).toHaveBeenCalled();
    });

    it("should use new format when popUpgradeHeight is 0 (always use new format)", async () => {
      const mockGetCurrentHeight = jest.fn().mockResolvedValue(100);
      
      const manager = new BabylonBtcStakingManager(
        networks.bitcoin,
        params,
        btcProvider,
        babylonProvider,
        undefined,
        {
          chainId: mockChainId,
          stakingModuleAddress: mockStakingModuleAddress,
          popUpgradeHeight: 0,
          getCurrentHeight: mockGetCurrentHeight,
        },
      );

      await manager.createProofOfPossession(
        "delegation:create",
        mockBech32Address,
        mockBtcAddress,
      );

      // Calculate expected message with context hash
      const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${mockStakingModuleAddress}`;
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

      const manager = new BabylonBtcStakingManager(
        networks.bitcoin,
        params,
        btcProvider,
        babylonProvider,
        undefined,
        {
          chainId: mockChainId,
          stakingModuleAddress: mockStakingModuleAddress,
          popUpgradeHeight: 200,
          getCurrentHeight: mockGetCurrentHeight,
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

    it("should throw error when trying to use new format without required config", async () => {
      const mockGetCurrentHeight = jest.fn().mockResolvedValue(300);

      const manager = new BabylonBtcStakingManager(
        networks.bitcoin,
        params,
        btcProvider,
        babylonProvider,
        undefined,
        {
          popUpgradeHeight: 200,
          getCurrentHeight: mockGetCurrentHeight,
        },
      );

      await expect(
        manager.createProofOfPossession(
          "delegation:create",
          mockBech32Address,
          mockBtcAddress,
        ),
      ).rejects.toThrow("chainId and stakingModuleAddress required for context generation");
    });
  });

  describe("BIP322 Support", () => {
    it("should use BIP322 signature for taproot addresses with new format", async () => {
      const mockTaprootAddress =
        "bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297";
      const mockGetCurrentHeight = jest.fn().mockResolvedValue(300);
      
      const manager = new BabylonBtcStakingManager(
        networks.bitcoin,
        params,
        btcProvider,
        babylonProvider,
        undefined,
        {
          chainId: mockChainId,
          stakingModuleAddress: mockStakingModuleAddress,
          popUpgradeHeight: 200,
          getCurrentHeight: mockGetCurrentHeight,
        },
      );

      await manager.createProofOfPossession(
        "delegation:create",
        mockBech32Address,
        mockTaprootAddress,
      );

      // Calculate expected message with context hash
      const expectedContextString = `btcstaking/0/staker_pop/${mockChainId}/${mockStakingModuleAddress}`;
      const expectedContextHash = sha256(Buffer.from(expectedContextString, "utf8")).toString("hex");
      const expectedMessage = expectedContextHash + mockBech32Address;

      expect(btcProvider.signMessage).toHaveBeenCalledWith(
        expectedMessage,
        "bip322-simple",
      );
    });
  });
});