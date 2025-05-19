import { btcstakingtx } from "@babylonlabs-io/babylon-proto-ts";
import { networks } from "bitcoinjs-lib";

import { type UTXO } from "../../../src";
import {
  BabylonBtcStakingManager,
  SigningStep,
} from "../../../src/staking/manager";

import { babylonProvider, btcProvider } from "./__mock__/providers";
import {
  babylonAddress,
  btcTipHeight,
  feeRate,
  invalidBabylonAddresses,
  invalidStartHeightArr,
  params,
  stakerInfo,
  stakerInfoArr,
  stakingInput,
  utxos,
} from "./__mock__/registration";

describe("Staking Manager", () => {
  describe("preStakeRegistrationBabylonTransaction", () => {
    let manager: BabylonBtcStakingManager;

    beforeEach(() => {
      manager = new BabylonBtcStakingManager(
        networks.testnet,
        params,
        btcProvider,
        babylonProvider,
      );
    });

    afterEach(() => {
      btcProvider.signPsbt.mockReset();
      btcProvider.signMessage.mockReset();
      babylonProvider.signTransaction.mockReset();
    });

    it.each(invalidStartHeightArr)(
      "should validate babylonBtcTipHeight",
      async (btcTipHeight, errorMessage) => {
        try {
          await manager.preStakeRegistrationBabylonTransaction(
            stakerInfo,
            stakingInput,
            btcTipHeight,
            utxos,
            feeRate,
            babylonAddress,
          );
        } catch (e: any) {
          expect(e.message).toMatch(errorMessage);
        }
      },
    );

    it("should validate input UTXOs", async () => {
      const utxos: UTXO[] = [];

      try {
        await manager.preStakeRegistrationBabylonTransaction(
          stakerInfo,
          stakingInput,
          btcTipHeight,
          utxos,
          feeRate,
          babylonAddress,
        );
      } catch (e: any) {
        expect(e.message).toMatch("No input UTXOs provided");
      }
    });

    it.each(invalidBabylonAddresses)(
      "should validate babylon address",
      async (babylonAddress) => {
        try {
          await manager.preStakeRegistrationBabylonTransaction(
            stakerInfo,
            stakingInput,
            btcTipHeight,
            utxos,
            feeRate,
            babylonAddress,
          );
        } catch (e: any) {
          expect(e.message).toMatch("Invalid Babylon address");
        }
      },
    );

    it("should validate babylon params", async () => {
      const btcTipHeight = 100;

      try {
        await manager.preStakeRegistrationBabylonTransaction(
          stakerInfo,
          stakingInput,
          btcTipHeight,
          utxos,
          feeRate,
          babylonAddress,
        );
      } catch (e: any) {
        expect(e.message).toMatch(
          `Babylon params not found for height ${btcTipHeight}`,
        );
      }
    });

    it.each(stakerInfoArr)(
      "should create valid pre stake registration tx",
      async (
        stakerInfo,
        {
          signedSlashingPsbt,
          signedUnbondingSlashingPsbt,
          signedBabylonAddress,
          slashingPsbt,
          unbondingSlashingPsbt,
          delegationMsg,
          stakingTxHex,
          signType,
        },
      ) => {
        btcProvider.signPsbt
          .mockResolvedValueOnce(signedSlashingPsbt)
          .mockResolvedValueOnce(signedUnbondingSlashingPsbt);
        btcProvider.signMessage.mockResolvedValueOnce(signedBabylonAddress);

        const { stakingTx } =
          await manager.preStakeRegistrationBabylonTransaction(
            stakerInfo,
            stakingInput,
            btcTipHeight,
            utxos,
            feeRate,
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
          signType,
        );
        expect(
          btcstakingtx.MsgCreateBTCDelegation.toJSON(
            babylonProvider.signTransaction.mock.calls[0][1].value,
          ),
        ).toEqual(delegationMsg);
        expect(stakingTx.toHex()).toBe(stakingTxHex);
      },
    );
  });
});
