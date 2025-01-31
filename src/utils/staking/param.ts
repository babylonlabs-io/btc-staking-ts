import { StakingParams, VersionedStakingParams } from "../../types/params";

/*
  Get the Babylon params version by BTC height
  @param height - The BTC height
  @param babylonParamsVersions - The Babylon params versions
  @returns The Babylon param
*/
export const getBabylonParamByBtcHeight = (
  height: number,
  babylonParamsVersions: VersionedStakingParams[],
): StakingParams => {
  // Sort by btcActivationHeight in ascending order
  const sortedParams = [...babylonParamsVersions].sort(
    (a, b) => b.btcActivationHeight - a.btcActivationHeight,
  );

  // Find first param where height is >= btcActivationHeight
  const param = sortedParams.find(
    (param) => height >= param.btcActivationHeight,
  );
  if (!param) throw new Error(`Babylon param not found for height ${height}`);
  return param;
};

/*
  Get the Babylon param by version
  @param version - The Babylon param version
  @param babylonParams - The Babylon params
  @returns The Babylon param
*/
export const getBabylonParamByVersion = (
  version: number,
  babylonParams: VersionedStakingParams[],
): StakingParams => {
  const param = babylonParams.find((param) => param.version === version);
  if (!param) throw new Error(`Babylon param not found for version ${version}`);
  return param;
};