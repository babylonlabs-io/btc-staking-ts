import { networks } from "bitcoinjs-lib";

import { initBTCCurve } from "../../../src";
import {
  BabylonBtcStakingManager,
  SigningStep,
} from "../../../src/staking/manager";

import {
  babylonAddress,
  delegationMsg,
  inclusionProof,
  params,
  signedBabylonAddress,
  signedSlashingPsbt,
  signedUnbondingSlashingPsbt,
  slashingPsbt,
  stakerInfo,
  stakingInput,
  stakingTx,
  startHeight,
  unbondingSlashingPsbt,
} from "./__mock__/postStaking";
import { babylonProvider, btcProvider } from "./__mock__/providers";

describe("Staking Manager", () => {
  describe("postStakeRegistrationBabylonTransaction", () => {
    let manager: BabylonBtcStakingManager;

    beforeAll(() => {
      initBTCCurve();
    });

    beforeEach(() => {
      manager = new BabylonBtcStakingManager(
        networks.testnet,
        params,
        btcProvider,
        babylonProvider,
      );
    });

    it("should validate babylonBtcTipHeight", async () => {
      const btcTipHeight = 0;

      try {
        await manager.postStakeRegistrationBabylonTransaction(
          stakerInfo,
          stakingTx,
          btcTipHeight,
          stakingInput,
          inclusionProof,
          babylonAddress,
        );
      } catch (e: any) {
        expect(e.message).toMatch(
          `Babylon params not found for height ${btcTipHeight}`,
        );
      }
    });

    it("should validate babylon address", async () => {
      const babylonAddress = "invalid-babylon-address";

      try {
        await manager.postStakeRegistrationBabylonTransaction(
          stakerInfo,
          stakingTx,
          startHeight,
          stakingInput,
          inclusionProof,
          babylonAddress,
        );
      } catch (e: any) {
        expect(e.message).toMatch("Invalid Babylon address");
      }
    });

    it("should validate tx output", async () => {
      const tx = {
        ...stakingTx,
        outs: [],
      } as any;

      try {
        await manager.postStakeRegistrationBabylonTransaction(
          stakerInfo,
          tx,
          startHeight,
          stakingInput,
          inclusionProof,
          babylonAddress,
        );
      } catch (e: any) {
        expect(e.message).toMatch(/Matching output not found for address:/);
      }
    });

    it("should create valid pre stake registration tx", async () => {
      btcProvider.signPsbt
        .mockResolvedValueOnce(signedSlashingPsbt)
        .mockResolvedValueOnce(signedUnbondingSlashingPsbt);
      btcProvider.signMessage.mockResolvedValueOnce(signedBabylonAddress);

      await manager.postStakeRegistrationBabylonTransaction(
        stakerInfo,
        stakingTx,
        startHeight,
        stakingInput,
        inclusionProof,
        babylonAddress,
      );

      expect(btcProvider.signPsbt).toHaveBeenCalledWith(
        SigningStep.STAKING_SLASHING,
        slashingPsbt,
      );
      expect(btcProvider.signPsbt).toHaveBeenCalledWith(
        SigningStep.UNBONDING_SLASHING,
        unbondingSlashingPsbt,
      );
      expect(btcProvider.signMessage).toHaveBeenCalledWith(
        SigningStep.PROOF_OF_POSSESSION,
        babylonAddress,
        "bip322-simple",
      );
      expect(babylonProvider.signTransaction).toHaveBeenCalledWith(
        SigningStep.CREATE_BTC_DELEGATION_MSG,
        delegationMsg,
      );
    });
  });
});
