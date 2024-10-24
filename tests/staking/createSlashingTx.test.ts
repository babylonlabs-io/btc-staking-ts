import * as stakingScript from "../../src/staking/stakingScript";
import { testingNetworks } from "../helper";
import * as transaction from "../../src/staking/transactions";
import { Staking } from "../../src/staking";
import { deriveAddressFromPkScript } from "../../src";
import { opcodes, payments, script } from "bitcoinjs-lib";
import { internalPubkey } from "../../src/constants/internalPubkey";

describe.each(testingNetworks)("Create slashing transactions", ({
  network, networkName, datagen: { stakingDatagen: dataGenerator }
}) => {
  const params = dataGenerator.generateStakingParams();
  const keys = dataGenerator.generateRandomKeyPair();
  const feeRate = 1;
  const stakingAmount = dataGenerator.getRandomIntegerBetween(
    params.minStakingAmountSat, params.maxStakingAmountSat,
  );
  const finalityProviderPkNoCoordHex = dataGenerator.generateRandomKeyPair().publicKeyNoCoord;
  const { stakingTx, timelock} = dataGenerator.generateRandomStakingTransaction(
    keys, feeRate, stakingAmount, "nativeSegwit", params,
  );
  const stakingOutputIndex = 0;
  const stakerPkNoCoordHex = keys.publicKeyNoCoord;
  const stakerInfo = {
    address: dataGenerator.getAddressAndScriptPubKey(keys.publicKey).nativeSegwit.address,
    publicKeyNoCoordHex: keys.publicKeyNoCoord,
    publicKeyWithCoord: keys.publicKey,
  }
  const staking = new Staking(
    network, stakerInfo,
    params, finalityProviderPkNoCoordHex, timelock,

  );
  const unbondingTx = staking.createUnbondingTransaction(
    stakingTx, stakingOutputIndex,
  ).psbt.signAllInputs(keys.keyPair).finalizeAllInputs().extractTransaction();


  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
    jest.restoreAllMocks();
  });

  describe("Create slash early unbonded transaction", () => {
    it(`${networkName} should throw an error if fail to build scripts`, () => {
      jest.spyOn(stakingScript, "StakingScriptData").mockImplementation(() => {
        throw new Error("slash early unbonded delegation build script error");
      });
      
      expect(() => staking.createSlashEarlyUnbondedTransaction(
        unbondingTx,
      )).toThrow("slash early unbonded delegation build script error");
    });

    it(`${networkName} should throw an error if fail to build early unbonded slash tx`, () => {
      jest.spyOn(transaction, "slashEarlyUnbondedTransaction").mockImplementation(() => {
        throw new Error("fail to build slash tx");
      });
      expect(() => staking.createSlashEarlyUnbondedTransaction(
        unbondingTx,
      )).toThrow("fail to build slash tx");
    });

    it(`${networkName} should create slash early unbonded transaction`, () => {
      const slashTx = staking.createSlashEarlyUnbondedTransaction(
        unbondingTx,
      );
      expect(slashTx.psbt.txInputs.length).toBe(1)
      expect(slashTx.psbt.txInputs[0].hash.toString("hex")).
        toBe(unbondingTx.getHash().toString("hex"));
      expect(slashTx.psbt.txInputs[0].index).toBe(0);
      // verify outputs
      expect(slashTx.psbt.txOutputs.length).toBe(2);
      // slash amount
      const stakingAmountLeftInUnbondingTx = unbondingTx.outs[0].value;
      const slashAmount = Math.floor(stakingAmountLeftInUnbondingTx * params.slashing!.slashingRate);
      expect(slashTx.psbt.txOutputs[0].value).toBe(
        slashAmount,
      );
      const slashingAddress = deriveAddressFromPkScript(
        params.slashing!.slashingPkScript, network,
      );
      expect(slashTx.psbt.txOutputs[0].address).toBe(slashingAddress);
      // change output
      const unbondingTimelockScript = script.compile([
        Buffer.from(stakerPkNoCoordHex, "hex"),
        opcodes.OP_CHECKSIGVERIFY,
        script.number.encode(params.unbondingTime),
        opcodes.OP_CHECKSEQUENCEVERIFY,
      ]);
      const { address } = payments.p2tr({
        internalPubkey,
        scriptTree: { output: unbondingTimelockScript },
        network,
      });
      expect(slashTx.psbt.txOutputs[1].address).toBe(address);
      const userFunds = stakingAmountLeftInUnbondingTx - slashAmount - params.slashing!.minSlashingTxFeeSat;
      expect(slashTx.psbt.txOutputs[1].value).toBe(userFunds);
      expect(slashTx.psbt.locktime).toBe(0);
      expect(slashTx.psbt.version).toBe(2);
    });
  });

  describe("Create slash timelock unbonded transaction", () => {
    it(`${networkName} should throw an error if fail to build scripts`, async () => {
      jest.spyOn(stakingScript, "StakingScriptData").mockImplementation(() => {
        throw new Error("slash timelock unbonded delegation build script error");
      });
      const staking = new Staking(
        network, stakerInfo,
        params, finalityProviderPkNoCoordHex, timelock,
      );

      expect(() => staking.createSlashTimelockUnbondedTransaction(
        stakingTx,
      )).toThrow("slash timelock unbonded delegation build script error");
    });

    it(`${networkName} should throw an error if fail to build timelock unbonded slash tx`, async () => {
      jest.spyOn(transaction, "slashTimelockUnbondedTransaction").mockImplementation(() => {
        throw new Error("fail to build slash tx");
      });

      expect(() => staking.createSlashTimelockUnbondedTransaction(
        stakingTx,
      )).toThrow("fail to build slash tx");
    });

    it(`${networkName} should create slash timelock unbonded transaction`, async () => {
      const slashTx = staking.createSlashTimelockUnbondedTransaction(
        stakingTx,
      );
      expect(slashTx.psbt.txInputs.length).toBe(1)
      expect(slashTx.psbt.txInputs[0].hash.toString("hex")).
        toBe(stakingTx.getHash().toString("hex"));
      expect(slashTx.psbt.txInputs[0].index).toBe(0);
      // verify outputs
      expect(slashTx.psbt.txOutputs.length).toBe(2);
      // slash amount
      const slashAmount = Math.floor(stakingAmount * params.slashing!.slashingRate);
      expect(slashTx.psbt.txOutputs[0].value).toBe(
        slashAmount,
      );
      const slashingAddress = deriveAddressFromPkScript(
        params.slashing!.slashingPkScript, network,
      );
      expect(slashTx.psbt.txOutputs[0].address).toBe(slashingAddress);
      // change output
      const unbondingTimelockScript = script.compile([
        Buffer.from(stakerPkNoCoordHex, "hex"),
        opcodes.OP_CHECKSIGVERIFY,
        script.number.encode(params.unbondingTime),
        opcodes.OP_CHECKSEQUENCEVERIFY,
      ]);
      const { address } = payments.p2tr({
        internalPubkey,
        scriptTree: { output: unbondingTimelockScript },
        network,
      });
      expect(slashTx.psbt.txOutputs[1].address).toBe(address);
      const userFunds = stakingAmount - slashAmount - params.slashing!.minSlashingTxFeeSat;
      expect(slashTx.psbt.txOutputs[1].value).toBe(userFunds);
      expect(slashTx.psbt.locktime).toBe(0);
      expect(slashTx.psbt.version).toBe(2);
    });
  });
});

