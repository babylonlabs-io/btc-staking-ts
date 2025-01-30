import { StakingParams, VersionedStakingParams } from "../../types/params";

/*
  Get the BBN param by BTC height
  @param height - The BTC height
  @param bbnParams - The BBN params
  @returns The BBN param
*/
export const getBbnParamByBtcHeight = (
  height: number,
  bbnParams: VersionedStakingParams[],
): StakingParams => {
  // Sort by activationHeight in ascending order
  const sortedParams = [...bbnParams].sort(
    (a, b) => b.activationHeight - a.activationHeight,
  );

  // Find first param where height is >= activationHeight
  const param = sortedParams.find(
    (param) => height >= param.activationHeight,
  );
  if (!param) throw new Error(`BBN param not found for height ${height}`);
  return param;
};

/*
  Get the BBN param by version
  @param version - The BBN param version
  @param bbnParams - The BBN params
  @returns The BBN param
*/
export const getBbnParamByVersion = (
  version: number,
  bbnParams: VersionedStakingParams[],
): StakingParams => {
  const param = bbnParams.find((param) => param.version === version);
  if (!param) throw new Error(`BBN param not found for version ${version}`);
  return param;
};