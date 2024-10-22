import { ObservableStakingScriptData, ObservableStakingScripts } from "../../../src/staking/observable";
import { ObservableStakingParams } from "../../../src/types/params";
import { StakingDataGenerator } from "./base";

export class ObservableStakingDatagen extends StakingDataGenerator {
   generateRandomTag = () => {
    const buffer = Buffer.alloc(4);
    for (let i = 0; i < 4; i++) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
    return buffer;
  };

  generateStakingParams = (fixedTerm = false, committeeSize?: number): ObservableStakingParams => {
    return {
      ...super.generateStakingParams(fixedTerm, committeeSize),
      activationHeight: this.getRandomIntegerBetween(1000, 100000),
      tag: this.generateRandomTag().toString("hex")
    };
  };

  generateStakingScriptData = (
    stakerPkNoCoord: string,
    params: ObservableStakingParams,
    timelock: number,
  ): ObservableStakingScripts => {
    const fpPkHex = this.generateRandomKeyPair().publicKeyNoCoord;
    return new ObservableStakingScriptData(
      Buffer.from(stakerPkNoCoord, "hex"),
      [Buffer.from(fpPkHex, "hex")],
      params.covenantNoCoordPks.map((pk: string) => Buffer.from(pk, "hex")),
      params.covenantQuorum,
      timelock,
      params.unbondingTime,
      Buffer.from(params.tag, "hex"),
    ).buildScripts();
  }
}