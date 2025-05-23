import { networks, Transaction } from "bitcoinjs-lib";

import {
  BabylonBtcStakingManager,
  SigningStep,
} from "../../../src/staking/manager";

import { btcstakingtx } from "@babylonlabs-io/babylon-proto-ts";
import { babylonProvider, btcProvider } from "./__mock__/providers";
import {
  babylonAddress,
  btcTipHeight,
  inclusionProof,
  invalidBabylonAddresses,
  invalidStartHeightArr,
  params,
  stakerInfo,
  stakerInfoArr,
  stakingInput,
  stakingTx,
} from "./__mock__/registration";

describe("Staking Manager", () => {
  describe("postStakeRegistrationBabylonTransaction", () => {
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
      "should validate babylonBtcTipHeight %s",
      async (btcTipHeight) => {
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
      },
    );

    it.each(invalidBabylonAddresses)(
      "should validate babylon address",
      async (babylonAddress) => {
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
          expect(e.message).toMatch("Invalid Babylon address");
        }
      },
    );

    it("should validate tx output", async () => {
      const tx = {
        ...stakingTx,
        outs: [],
      } as any;

      try {
        await manager.postStakeRegistrationBabylonTransaction(
          stakerInfo,
          tx,
          btcTipHeight,
          stakingInput,
          inclusionProof,
          babylonAddress,
        );
      } catch (e: any) {
        expect(e.message).toMatch(/Matching output not found for address:/);
      }
    });

    it.each(stakerInfoArr)(
      "should create valid pre stake registration tx",
      async (
        stakerInfo,
        {
          slashingPsbt,
          unbondingSlashingPsbt,
          signedSlashingPsbt,
          signedUnbondingSlashingPsbt,
          signedBabylonAddress,
          stakingTxHex,
          postStakingDelegationMsg,
          signType,
        },
      ) => {
        btcProvider.signPsbt
          .mockResolvedValueOnce(signedSlashingPsbt)
          .mockResolvedValueOnce(signedUnbondingSlashingPsbt);
        btcProvider.signMessage.mockResolvedValueOnce(signedBabylonAddress);

        await manager.postStakeRegistrationBabylonTransaction(
          stakerInfo,
          Transaction.fromHex(stakingTxHex),
          btcTipHeight,
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
          signType,
        );
        expect(
          btcstakingtx.MsgCreateBTCDelegation.toJSON(
            babylonProvider.signTransaction.mock.calls[0][1].value,
          ),
        ).toEqual(postStakingDelegationMsg);
      },
    );
  });
});
