import * as bitcoin from "bitcoinjs-lib";
import { StakingDataGenerator } from "./datagen/base";

export interface NetworkConfig {
  networkName: string;
  network: bitcoin.Network;
  datagen: StakingDataGenerator
}

const createNetworkConfig = (
  networkName: string,
  network: bitcoin.Network,
): NetworkConfig => ({
  networkName,
  network,
  datagen: new StakingDataGenerator(network),
});

const testingNetworks: NetworkConfig[] = [
  createNetworkConfig("mainnet", bitcoin.networks.bitcoin),
  createNetworkConfig("testnet", bitcoin.networks.testnet),
];

export default testingNetworks;
