export interface StakingParams {
  covenantNoCoordPks: string[];
  covenantQuorum: number;
  unbondingTime: number;
  unbondingFeeSat: number;
  maxStakingAmountSat: number;
  minStakingAmountSat: number;
  maxStakingTimeBlocks: number;
  minStakingTimeBlocks: number;
  slashing?: {
    slashingPkScript: string;
    slashingRate: number;
  }
}

export interface ObservableStakingParams extends StakingParams {
  activationHeight: number;
  tag: string;
}