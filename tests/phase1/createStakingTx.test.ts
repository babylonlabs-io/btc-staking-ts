import { Psbt } from "bitcoinjs-lib";
import { Phase1Staking } from "../../src";
// import { getStakingTxInputUTXOsAndFees } from "../../src/utils/fee";
// import { StakingError, StakingErrorCode } from "../../src/error";
import { testingNetworks } from "../helper";
import { ECPairInterface } from "ecpair";
import { Phase1Params } from "../../src/types/params";
import { UTXO } from "../../src/types/UTXO";

describe("Create staking transaction", () => {
  const { network, networkName, dataGenerator } = testingNetworks[0];

  let stakerInfo: { address: string, publicKeyHex: string };
  let finalityProviderPublicKey: string;
  let params: Phase1Params;
  let stakingTerm: number;
  let utxos: UTXO[];
  let feeRate: number;
  let stakerKeyPair: ECPairInterface;

  beforeEach(() => {
    const { publicKey, publicKeyNoCoord, keyPair} = dataGenerator.generateRandomKeyPair();
    stakerKeyPair = keyPair.tweak(Buffer.from(publicKeyNoCoord, "hex"));
    const {address, scriptPubKey} = dataGenerator.getAddressAndScriptPubKey(
      publicKey,
    ).taproot;
    
    stakerInfo = {
      address,
      publicKeyHex: publicKeyNoCoord,
    };
    finalityProviderPublicKey = dataGenerator.generateRandomKeyPair().publicKeyNoCoord;
    params = dataGenerator.generateRandomPhase1Params(true);
    stakingTerm = dataGenerator.generateRandomStakingTerm();
    utxos = dataGenerator.generateRandomUTXOs(
      params.maxStakingAmountSat * dataGenerator.getRandomIntegerBetween(1, 100),
      dataGenerator.getRandomIntegerBetween(1, 10),
      scriptPubKey,
    );
    feeRate = dataGenerator.getRandomIntegerBetween(1, 100);
  });
    // it(`${networkName} throw StakingError if stakerInfo is incorrect`, async () => {
    //   const stakerInfoWithCoordPk = {
    //     address,
    //     publicKeyHex: stakerKeyPair.publicKey,
    //   };
    //   expect(() => new Phase1Staking(network, stakerInfoWithCoordPk)).toThrow(
    //     // Specify the expected error class and message
    //     new StakingError(StakingErrorCode.SCRIPT_FAILURE, "Invalid staker info")
    //   );
    // });

    // it(`${networkName} should throw an error if input data validaiton failed`, async () => {
    //   const phase1Staking = new Phase1Staking(network, stakerInfo);
    //   jest.spyOn(phase1Staking, "createStakingTransaction").mockImplementation(() => {
    //     throw new StakingError(StakingErrorCode.INVALID_INPUT, "some error");
    //   });

    //   expect(() => phase1Staking.createStakingTransaction(
    //     params,
    //     params.minStakingAmountSat - 1,
    //     stakingTerm,
    //     finalityProviderPublicKey,
    //     utxos,
    //     feeRate,
    //   )).toThrow(
    //     new StakingError(StakingErrorCode.INVALID_INPUT, "some error")
    //   );
    // });

    it(`${networkName} should successfully create a staking transaction`, async () => {
      const phase1Staking = new Phase1Staking(network, stakerInfo);
      const { psbt, fee} = phase1Staking.createStakingTransaction(
        params,
        dataGenerator.getRandomIntegerBetween(
          params.minStakingAmountSat, params.maxStakingAmountSat,
        ),
        stakingTerm,
        finalityProviderPublicKey,
        utxos,
        feeRate,
      );

      expect(psbt).toBeDefined();
      expect(fee).toBeGreaterThan(0);
      expect(isFeeInAcceptableRange(fee, feeRate, psbt, stakerKeyPair)).toBe(true);

      expect(psbt.data.inputs.length).toBe(1);
    });
});

const isFeeInAcceptableRange = (
  fee: number, feeRate: number,
  psbt: Psbt, keyPair: ECPairInterface,
): boolean => {
  const tx = psbt.signAllInputs(keyPair).finalizeAllInputs().extractTransaction();
  const txSize = tx.virtualSize();
  // const psbtSize = psbt.data.toBuffer().length;
  const expectedFee = feeRate * txSize;
  const acceptableRange = 0.3;
  return fee >= expectedFee * (1 - acceptableRange) && fee <= expectedFee * (1 + acceptableRange);
}