import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import * as bitcoin from "bitcoinjs-lib";
import ECPairFactory from "ecpair";
import { StakingScriptData, stakingTransaction } from "../../src";
import { UTXO } from "../../src/types/UTXO";
import { StakingScripts } from "../../src/staking/stakingScript";
import { ObservableStakingParams } from "../../src/types/params";
import { generateRandomAmountSlices } from "./math";

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

export const DEFAULT_TEST_FEE_RATE = 15;

export interface KeyPair {
  privateKey: string;
  publicKey: string;
  publicKeyNoCoord: string;
  keyPair: bitcoin.Signer;
}

export class DataGenerator {
  private network: bitcoin.networks.Network;

  constructor(network: bitcoin.networks.Network) {
    this.network = network;
  }

  generateRandomTxId = () => {
    const randomBuffer = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) {
      randomBuffer[i] = Math.floor(Math.random() * 256);
    }
    return randomBuffer.toString("hex");
  };

  generateRandomKeyPair = () => {
    const keyPair = ECPair.makeRandom({ network: this.network });
    const { privateKey, publicKey } = keyPair;
    if (!privateKey || !publicKey) {
      throw new Error("Failed to generate random key pair");
    }
    const pk = publicKey.toString("hex");

    return {
      privateKey: privateKey.toString("hex"),
      publicKey: pk,
      publicKeyNoCoord: pk.slice(2),
      keyPair,
    };
  };

  // Generate a random staking term (number of blocks to stake)
  // ranged from 1 to 65535
  generateRandomStakingTerm = (
    params: { minStakingTimeBlocks: number, maxStakingTimeBlocks: number},
  ) => {
    if (params.minStakingTimeBlocks === params.maxStakingTimeBlocks) {
      return params.minStakingTimeBlocks;
    }
    return this.getRandomIntegerBetween(
      params.minStakingTimeBlocks,
      params.maxStakingTimeBlocks,
    );
  };

  generateRandomUnbondingTime = (stakingTerm: number) => {
    return Math.floor(Math.random() * stakingTerm) + 1;
  };

  generateRandomFeeRates = () => {
    return Math.floor(Math.random() * 1000) + 1;
  };

  // Real values will likely be in range 0.01 to 0.30
  generateRandomSlashingRate(min: number = 0.01, max: number = 0.30): number {
    return parseFloat((Math.random() * (max - min) + min).toFixed(2));
  }

  // Convenant committee are a list of public keys that are used to sign a covenant
  generateRandomCovenantCommittee = (size: number): Buffer[] => {
    const committe: Buffer[] = [];
    for (let i = 0; i < size; i++) {
      const publicKeyNoCoord = this.generateRandomKeyPair().publicKeyNoCoord;
      committe.push(Buffer.from(publicKeyNoCoord, "hex"));
    }
    return committe;
  };

  generateRandomTag = () => {
    const buffer = Buffer.alloc(4);
    for (let i = 0; i < 4; i++) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
    return buffer;
  };

  generateRandomObservalbleStakingParams = (fixedTerm = false, committeeSize?: number): ObservableStakingParams => {
    if (!committeeSize) {
      committeeSize = this.getRandomIntegerBetween(5, 50);
    }
    const covenantPks = this.generateRandomCovenantCommittee(committeeSize).map(
      (buffer) => buffer.toString("hex"),
    );
    const covenantQuorum = Math.floor(Math.random() * (committeeSize - 1)) + 1;
    
    const tag = this.generateRandomTag().toString("hex");

    const minStakingAmountSat = this.getRandomIntegerBetween(100000, 1000000000);
    const minStakingTimeBlocks = this.getRandomIntegerBetween(1, 2000);
    const maxStakingTimeBlocks = fixedTerm ? minStakingTimeBlocks : this.getRandomIntegerBetween(minStakingTimeBlocks, minStakingTimeBlocks + 1000);
    const stakingTerm = this.generateRandomStakingTerm({minStakingTimeBlocks, maxStakingTimeBlocks});
    const unbondingTime = this.generateRandomUnbondingTime(stakingTerm);
    return {
      covenantPks,
      covenantQuorum,
      unbondingTime,
      unbondingFeeSat: this.getRandomIntegerBetween(1000, 100000),
      minStakingAmountSat,
      maxStakingAmountSat: this.getRandomIntegerBetween(
        minStakingAmountSat, minStakingAmountSat + 1000000000,
      ),
      minStakingTimeBlocks,
      maxStakingTimeBlocks,
      activationHeight: this.getRandomIntegerBetween(1000, 100000),
      tag,
    };
  };

  getAddressAndScriptPubKey = (publicKey: string) => {
    return {
      taproot: this.getTaprootAddress(publicKey),
      nativeSegwit: this.getNativeSegwitAddress(publicKey),
    };
  };

  getNetwork = () => {
    return this.network;
  };

  generateMockStakingScripts = (stakerKeyPair?: KeyPair): StakingScripts => {
    if (!stakerKeyPair) {
      stakerKeyPair = this.generateRandomKeyPair();
    }
    const finalityProviderPk = this.generateRandomKeyPair().publicKeyNoCoord;
    
    const publicKeyNoCoord = stakerKeyPair.publicKeyNoCoord;
    const committeeSize = this.getRandomIntegerBetween(1, 10);
    const globalParams = this.generateRandomObservalbleStakingParams(
      false,
      committeeSize,
    );
    const stakingTxTimelock = this.generateRandomStakingTerm(globalParams);

    // Convert covenant PKs to buffers
    const covenantPKsBuffer = globalParams.covenantPks.map((pk: string) =>
      Buffer.from(pk, "hex"),
    );

    // Create staking script data
    let stakingScriptData;
    try {
      stakingScriptData = new StakingScriptData(
        Buffer.from(publicKeyNoCoord, "hex"),
        [Buffer.from(finalityProviderPk, "hex")],
        covenantPKsBuffer,
        globalParams.covenantQuorum,
        stakingTxTimelock,
        globalParams.unbondingTime,
        Buffer.from(globalParams.tag, "hex"),
      );
    } catch (error: any) {
      throw new Error(error?.message || "Cannot build staking script data");
    }

    // Build scripts
    let scripts;
    try {
      scripts = stakingScriptData.buildScripts();
    } catch (error: Error | any) {
      throw new Error(error?.message || "Error while recreating scripts");
    }

    return scripts;
  };

  generateRandomUTXOs = (
    balance: number,
    numberOfUTXOs: number,
    scriptPubKey?: string,
  ): UTXO[] => {
    if (!scriptPubKey) {
      const pk = this.generateRandomKeyPair().publicKey;
      const { nativeSegwit } = this.getAddressAndScriptPubKey(pk);
      scriptPubKey = nativeSegwit.scriptPubKey;
    }
    const slices = generateRandomAmountSlices(balance, numberOfUTXOs);
    return slices.map((v) => {
      return {
        txid: this.generateRandomTxId(),
        vout: Math.floor(Math.random() * 10),
        scriptPubKey: scriptPubKey,
        value: v,
      };
    });
  };

  /**
   * Generates a random integer between min and max.
   *
   * @param {number} min - The minimum number.
   * @param {number} max - The maximum number.
   * @returns {number} - A random integer between min and max.
   */
  getRandomIntegerBetween = (min: number, max: number): number => {
    if (min > max) {
      throw new Error(
        "The minimum number should be less than or equal to the maximum number.",
      );
    }
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  generateRandomStakingTransaction = (
    stakerKeyPair: KeyPair,
    feeRate: number = DEFAULT_TEST_FEE_RATE,
    stakingAmount?: number,
    addressType?: "taproot" | "nativeSegwit",
    globalParam?: ObservableStakingParams,
  ) => {
    const { publicKey, publicKeyNoCoord: stakerPublicKeyNoCoord } =
      stakerKeyPair;
    const { taproot, nativeSegwit } = this.getAddressAndScriptPubKey(publicKey);
    const address =
      addressType === "taproot" ? taproot.address : nativeSegwit.address;
    const scriptPubKey =
      addressType === "taproot"
        ? taproot.scriptPubKey
        : nativeSegwit.scriptPubKey;
    const fpPkHex = this.generateRandomKeyPair().publicKeyNoCoord;

    const committeeSize = this.getRandomIntegerBetween(1, 10);
    
    const param = globalParam
      ? globalParam
      : this.generateRandomObservalbleStakingParams(false, committeeSize);
    const stakingTerm = this.generateRandomStakingTerm(param);
    
    const stakingScriptData = new StakingScriptData(
      Buffer.from(stakerPublicKeyNoCoord, "hex"),
      [Buffer.from(fpPkHex, "hex")],
      param.covenantPks.map((pk: string) => Buffer.from(pk, "hex")),
      param.covenantQuorum,
      stakingTerm,
      param.unbondingTime,
      Buffer.from(param.tag, "hex"),
    );

    const stakingScripts = stakingScriptData.buildScripts();
    const stakingAmountSat = stakingAmount ? 
      stakingAmount : this.getRandomIntegerBetween(
        param.minStakingAmountSat, param.maxStakingAmountSat,
      );
    const utxos = this.generateRandomUTXOs(
      this.getRandomIntegerBetween(stakingAmountSat, stakingAmountSat + 100000000),
      this.getRandomIntegerBetween(1, 10),
      scriptPubKey,
    );

    const { psbt } = stakingTransaction(
      stakingScripts,
      stakingAmount
        ? stakingAmount
        : this.getRandomIntegerBetween(1000, 100000) + 10000,
      address,
      utxos,
      this.network,
      feeRate,
    );
    const stakingTx = psbt.signAllInputs(stakerKeyPair.keyPair)
    .finalizeAllInputs()
    .extractTransaction();

    return {
      stakingTx,
      unsignedPsbt: psbt,
      stakingTerm
    }
  };

  private getTaprootAddress = (publicKeyWithCoord: string) => {
    // Remove the prefix if it exists
    let publicKeyNoCoord = "";
    if (publicKeyWithCoord.length == 66) {
      publicKeyNoCoord = publicKeyWithCoord.slice(2);
    }
    const internalPubkey = Buffer.from(publicKeyNoCoord, "hex");
    const { address, output: scriptPubKey } = bitcoin.payments.p2tr({
      internalPubkey,
      network: this.network,
    });
    if (!address || !scriptPubKey) {
      throw new Error(
        "Failed to generate taproot address or script from public key",
      );
    }
    return {
      address,
      scriptPubKey: scriptPubKey.toString("hex"),
    };
  };

  private getNativeSegwitAddress = (publicKey: string) => {
    // check the public key length is 66, otherwise throw
    if (publicKey.length !== 66) {
      throw new Error(
        "Invalid public key length for generating native segwit address",
      );
    }
    const internalPubkey = Buffer.from(publicKey, "hex");
    const { address, output: scriptPubKey } = bitcoin.payments.p2wpkh({
      pubkey: internalPubkey,
      network: this.network,
    });
    if (!address || !scriptPubKey) {
      throw new Error(
        "Failed to generate native segwit address or script from public key",
      );
    }
    return {
      address,
      scriptPubKey: scriptPubKey.toString("hex"),
    };
  };
}

export default DataGenerator;
