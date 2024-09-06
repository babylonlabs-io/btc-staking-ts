// Common params across multiple phases, according to
// https://github.com/babylonlabs-io/pm/blob/main/adr/adr-023-update-btcstaking-params.md
export interface Params {
  covenantPks: string[];
  covenantQuorum: number;
  unbondingTime: number;
  unbondingFeeSat: number;
  maxStakingAmountSat: number;
  minStakingAmountSat: number;
  maxStakingTimeBlocks: number;
  minStakingTimeBlocks: number;
}


export interface Phase1Params extends Params {
  activationHeight: number;
  tag: string;
}