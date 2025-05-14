import { networks } from "bitcoinjs-lib";

import { initBTCCurve } from "../../../src";
import { BabylonBtcStakingManager } from "../../../src/staking/manager";

import {
  btcTipHeight,
  feeRate,
  stakerInfo,
  stakingInput,
  stakingParams,
  utxos,
} from "./__mock__/fee";
import { babylonProvider, btcProvider } from "./__mock__/providers";

describe("Staking Manager", () => {
  describe("estimateBtcStakingFee", () => {
    let manager: BabylonBtcStakingManager;

    beforeAll(() => {
      initBTCCurve();
    });

    beforeEach(() => {
      manager = new BabylonBtcStakingManager(
        networks.testnet,
        stakingParams,
        btcProvider,
        babylonProvider,
      );
    });

    it("should validate babylonBtcTipHeight", async () => {
      const btcTipHeight = 0;

      try {
        await manager.estimateBtcStakingFee(
          stakerInfo,
          btcTipHeight,
          stakingInput,
          utxos,
          feeRate,
        );
      } catch (e: any) {
        expect(e.message).toMatch(
          `Babylon BTC tip height cannot be ${btcTipHeight}`,
        );
      }
    });

    it("should validate babylonBtcTipHeight", async () => {
      const btcTipHeight = 100;

      try {
        await manager.estimateBtcStakingFee(
          stakerInfo,
          btcTipHeight,
          stakingInput,
          utxos,
          feeRate,
        );
      } catch (e: any) {
        expect(e.message).toMatch(
          `Babylon params not found for height ${btcTipHeight}`,
        );
      }
    });

    it("should return valid tx fee", async () => {
      const txFee = await manager.estimateBtcStakingFee(
        stakerInfo,
        btcTipHeight,
        stakingInput,
        utxos,
        feeRate,
      );

      expect(txFee).toEqual(620);
    });
  });
});
