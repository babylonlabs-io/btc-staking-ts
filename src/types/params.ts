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

export interface ObservableStakingParams extends Params {
  activationHeight: number;
  tag: string;
}