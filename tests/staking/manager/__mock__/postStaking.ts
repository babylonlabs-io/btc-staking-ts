import { btcstakingtx } from "@babylonlabs-io/babylon-proto-ts";
import { Transaction } from "bitcoinjs-lib";
import { getPublicKeyNoCoord } from "../../../../src";
import { BABYLON_REGISTRY_TYPE_URLS } from "../../../../src/constants/registry";

export const params = [
  {
    version: 0,
    covenant_pks: [
      "ffeaec52a9b407b355ef6967a7ffc15fd6c3fe07de2844d61550475e7a5233e5",
      "a5c60c2188e833d39d0fa798ab3f69aa12ed3dd2f3bad659effa252782de3c31",
      "59d3532148a597a2d05c0395bf5f7176044b1cd312f37701a9b4d0aad70bc5a4",
    ],
    covenant_quorum: 2,
    min_staking_value_sat: 10000,
    max_staking_value_sat: 1000000000000,
    min_staking_time_blocks: 100,
    max_staking_time_blocks: 60000,
    slashing_pk_script: "0014f87283ca2ab20a1ab50cc7cea290f722c9a24574",
    min_slashing_tx_fee_sat: 1000,
    slashing_rate: "0.100000000000000000",
    unbonding_time_blocks: 20,
    unbonding_fee_sat: 500,
    min_commission_rate: "0.050000000000000000",
    max_active_finality_providers: 0,
    delegation_creation_base_gas_fee: 1000000,
    allow_list_expiration_height: 1440,
    btc_activation_height: 222170,
  },
  {
    version: 1,
    covenant_pks: [
      "ffeaec52a9b407b355ef6967a7ffc15fd6c3fe07de2844d61550475e7a5233e5",
      "a5c60c2188e833d39d0fa798ab3f69aa12ed3dd2f3bad659effa252782de3c31",
      "59d3532148a597a2d05c0395bf5f7176044b1cd312f37701a9b4d0aad70bc5a4",
    ],
    covenant_quorum: 2,
    min_staking_value_sat: 10000,
    max_staking_value_sat: 100000,
    min_staking_time_blocks: 100,
    max_staking_time_blocks: 60000,
    slashing_pk_script: "0014f87283ca2ab20a1ab50cc7cea290f722c9a24574",
    min_slashing_tx_fee_sat: 1000,
    slashing_rate: "0.100000000000000000",
    unbonding_time_blocks: 20,
    unbonding_fee_sat: 500,
    min_commission_rate: "0.050000000000000000",
    max_active_finality_providers: 0,
    delegation_creation_base_gas_fee: 1000000,
    allow_list_expiration_height: 1440,
    btc_activation_height: 227443,
  },
  {
    version: 2,
    covenant_pks: [
      "ffeaec52a9b407b355ef6967a7ffc15fd6c3fe07de2844d61550475e7a5233e5",
      "a5c60c2188e833d39d0fa798ab3f69aa12ed3dd2f3bad659effa252782de3c31",
      "59d3532148a597a2d05c0395bf5f7176044b1cd312f37701a9b4d0aad70bc5a4",
    ],
    covenant_quorum: 2,
    min_staking_value_sat: 10000,
    max_staking_value_sat: 1000000000000,
    min_staking_time_blocks: 100,
    max_staking_time_blocks: 60000,
    slashing_pk_script: "0014f87283ca2ab20a1ab50cc7cea290f722c9a24574",
    min_slashing_tx_fee_sat: 1000,
    slashing_rate: "0.100000000000000000",
    unbonding_time_blocks: 5,
    unbonding_fee_sat: 500,
    min_commission_rate: "0.050000000000000000",
    max_active_finality_providers: 0,
    delegation_creation_base_gas_fee: 1000000,
    allow_list_expiration_height: 1440,
    btc_activation_height: 227490,
  },
].map((v) => ({
  version: v.version,
  covenantNoCoordPks: v.covenant_pks.map((pk) =>
    String(getPublicKeyNoCoord(pk)),
  ),
  covenantQuorum: v.covenant_quorum,
  minStakingValueSat: v.min_staking_value_sat,
  maxStakingValueSat: v.max_staking_value_sat,
  minStakingTimeBlocks: v.min_staking_time_blocks,
  maxStakingTimeBlocks: v.max_staking_time_blocks,
  unbondingTime: v.unbonding_time_blocks,
  unbondingFeeSat: v.unbonding_fee_sat,
  minCommissionRate: v.min_commission_rate,
  maxActiveFinalityProviders: v.max_active_finality_providers,
  delegationCreationBaseGasFee: v.delegation_creation_base_gas_fee,
  slashing: {
    slashingPkScriptHex: v.slashing_pk_script,
    slashingRate: parseFloat(v.slashing_rate),
    minSlashingTxFeeSat: v.min_slashing_tx_fee_sat,
  },
  maxStakingAmountSat: v.max_staking_value_sat,
  minStakingAmountSat: v.min_staking_value_sat,
  btcActivationHeight: v.btc_activation_height,
  allowListExpirationHeight: v.allow_list_expiration_height,
}));

export const stakerInfo = {
  publicKeyNoCoordHex: getPublicKeyNoCoord(
    "358818f214fcd9d4ccc4296c9079ec25ed440b0df4acc34bedaa76c2c1955a19",
  ),
  address: "tb1p2wl2dglg0sqv4r8l7r4uc5av72hyty8zprelfa4kwxw9xhqkv55s3kz7ze",
};

export const stakingTx = Transaction.fromHex(
  "02000000000101cb3c161e2a23fa8a910688c79e7fedf073960791a22a71a8d3042d69a4051d190100000000fdffffff031027000000000000225120214aaa598d63cb55d51aa17c7ecc0ae3c6635255e318f09aeb2626b2783f0d780000000000000000496a476262743000358818f214fcd9d4ccc4296c9079ec25ed440b0df4acc34bedaa76c2c1955a19ee9da95e9fecbb2191943c56a109d1dc81787a77994ad9ef89278850a58e487603e8c17b16000000000022512053bea6a3e87c00ca8cfff0ebcc53acf2ae4590e208f3f4f6b6719c535c1665290140d2e8a6f1e8b393ea56f74608d01b7fc95ea324f762384f6279fdeb2af287a149481b02a71476a9f64f892ecf637bffc92803630f5e48fedefe0d4cf0d49b4d5372780300",
);

export const startHeight = 229159;

export const stakingInput = {
  finalityProviderPkNoCoordHex: getPublicKeyNoCoord(
    "ee9da95e9fecbb2191943c56a109d1dc81787a77994ad9ef89278850a58e4876",
  ),
  stakingAmountSat: 10000,
  stakingTimelock: 1000,
};

export const inclusionProof = {
  blockHashHex:
    "000000826cbd5d4da4830d13ed6ed685b0eaaff44903b73f923a1de710735290",
  merkle: [
    "6cc416ec8dc5bbc4ba9b600105b0a59bb27052d0c6e1445be17a3a18d6736142",
    "87157e864eb7231e1a95e81e5838f49f4edf8b660f516059eb90304efe2b17b9",
    "6c76735e36b0844548497d89d07a82fd643bdff131f40d1456bedd1539db357d",
    "5a9a68b7bffeada71d23e85456792780760d18cff790b17dc9bd6ea16d3945cc",
    "f9ca8817643d23428dbed5158050044fff43f22e6fb28cfbcc72009e4a5552c7",
    "f7d4b0610b5c6bfa40c2a312f4e0fd9a0c93aba0134666359171ec17c0e994b0",
    "596c9582a2a7dd1dee6d222100e1085fb87956f2f575a07a93a9e9753bfb8a3a",
    "c004a4bfb1d8c636b17f82526e59859ae5b34f82bf66c37eb7ee89a9bd3df33c",
    "1f3a1322c218e173125752f3bfa95b8c8247bed299bbc136ed048dc462575763",
  ],
  pos: 182,
};

export const babylonAddress = "bbn1cyqgpk0nlsutlm5ymkfpya30fqntanc8slpure";

export const slashingPsbt =
  "70736274ff01007d02000000015d04ca10273329df95c0e42976749bc633085fce57d02143102c42b30bc167890000000000ffffffff02e803000000000000160014f87283ca2ab20a1ab50cc7cea290f722c9a24574401f000000000000225120abb2a904515625466b71cb29cd27f24a52327946305585220f32807080727c22000000000001012b1027000000000000225120214aaa598d63cb55d51aa17c7ecc0ae3c6635255e318f09aeb2626b2783f0d784215c050929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0898a6f85535c6c5205e1c90378797f919c079f34b2835f64fa78a75a2196bdd5ad20358818f214fcd9d4ccc4296c9079ec25ed440b0df4acc34bedaa76c2c1955a19ad20ee9da95e9fecbb2191943c56a109d1dc81787a77994ad9ef89278850a58e4876ad2059d3532148a597a2d05c0395bf5f7176044b1cd312f37701a9b4d0aad70bc5a4ac20a5c60c2188e833d39d0fa798ab3f69aa12ed3dd2f3bad659effa252782de3c31ba20ffeaec52a9b407b355ef6967a7ffc15fd6c3fe07de2844d61550475e7a5233e5ba529cc001172050929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0000000";

export const unbondingSlashingPsbt =
  "70736274ff01007d02000000010932b48df8bfb8da25b04b57f339042bdfccda125d1e98cdff6957d64151fed30000000000ffffffff02b603000000000000160014f87283ca2ab20a1ab50cc7cea290f722c9a245747e1d000000000000225120abb2a904515625466b71cb29cd27f24a52327946305585220f32807080727c22000000000001012b1c25000000000000225120b21f74ee1e461e8b145622a40d0648c35c3b71c1d9c16937d8e69e5e8f65e1eb4215c050929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0aa8ab241dbb4c786ca730ee11f278a6e58ca4db63d368498d6db4d77905af837ad20358818f214fcd9d4ccc4296c9079ec25ed440b0df4acc34bedaa76c2c1955a19ad20ee9da95e9fecbb2191943c56a109d1dc81787a77994ad9ef89278850a58e4876ad2059d3532148a597a2d05c0395bf5f7176044b1cd312f37701a9b4d0aad70bc5a4ac20a5c60c2188e833d39d0fa798ab3f69aa12ed3dd2f3bad659effa252782de3c31ba20ffeaec52a9b407b355ef6967a7ffc15fd6c3fe07de2844d61550475e7a5233e5ba529cc001172050929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0000000";

export const signedSlashingPsbt =
  "70736274ff01007d02000000015d04ca10273329df95c0e42976749bc633085fce57d02143102c42b30bc167890000000000ffffffff02e803000000000000160014f87283ca2ab20a1ab50cc7cea290f722c9a24574401f000000000000225120abb2a904515625466b71cb29cd27f24a52327946305585220f32807080727c22000000000001012b1027000000000000225120214aaa598d63cb55d51aa17c7ecc0ae3c6635255e318f09aeb2626b2783f0d780108fd3101034048eb15d895fed7e3f358abf62a42ebb8cbefa47a8c0d078008f549eae560cb76f81b351fc980bfd84c78c3f6f9f3a45fc37a0781d77283c97fb75ff08c4a87f4ac20358818f214fcd9d4ccc4296c9079ec25ed440b0df4acc34bedaa76c2c1955a19ad20ee9da95e9fecbb2191943c56a109d1dc81787a77994ad9ef89278850a58e4876ad2059d3532148a597a2d05c0395bf5f7176044b1cd312f37701a9b4d0aad70bc5a4ac20a5c60c2188e833d39d0fa798ab3f69aa12ed3dd2f3bad659effa252782de3c31ba20ffeaec52a9b407b355ef6967a7ffc15fd6c3fe07de2844d61550475e7a5233e5ba529c41c050929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0898a6f85535c6c5205e1c90378797f919c079f34b2835f64fa78a75a2196bdd5000000";

export const signedUnbondingSlashingPsbt =
  "70736274ff01007d02000000010932b48df8bfb8da25b04b57f339042bdfccda125d1e98cdff6957d64151fed30000000000ffffffff02b603000000000000160014f87283ca2ab20a1ab50cc7cea290f722c9a245747e1d000000000000225120abb2a904515625466b71cb29cd27f24a52327946305585220f32807080727c22000000000001012b1c25000000000000225120b21f74ee1e461e8b145622a40d0648c35c3b71c1d9c16937d8e69e5e8f65e1eb0108fd3101034032661f9bcb67870df886bc2fad49e0c484ec509f0fdec384e54c775324615aa61c6d92abbc563e266fc1b3c5c32dad4743f5b92cbb9a68367580c381210a888dac20358818f214fcd9d4ccc4296c9079ec25ed440b0df4acc34bedaa76c2c1955a19ad20ee9da95e9fecbb2191943c56a109d1dc81787a77994ad9ef89278850a58e4876ad2059d3532148a597a2d05c0395bf5f7176044b1cd312f37701a9b4d0aad70bc5a4ac20a5c60c2188e833d39d0fa798ab3f69aa12ed3dd2f3bad659effa252782de3c31ba20ffeaec52a9b407b355ef6967a7ffc15fd6c3fe07de2844d61550475e7a5233e5ba529c41c050929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0aa8ab241dbb4c786ca730ee11f278a6e58ca4db63d368498d6db4d77905af837000000";

export const signedBabylonAddress = "";

export const delegationMsg = {
  typeUrl: BABYLON_REGISTRY_TYPE_URLS.MsgCreateBTCDelegation,
  value: btcstakingtx.MsgCreateBTCDelegation.fromJSON({
    stakerAddr: "bbn1cyqgpk0nlsutlm5ymkfpya30fqntanc8slpure",
    pop: {
      btcSigType: "BIP322",
      btcSig:
        "Cj50YjFwMndsMmRnbGcwc3F2NHI4bDdyNHVjNWF2NzJoeXR5OHpwcmVsZmE0a3d4dzl4aHFrdjU1czNrejd6ZQ==",
    },
    btcPk: "NYgY8hT82dTMxClskHnsJe1ECw30rMNL7ap2wsGVWhk=",
    fpBtcPkList: ["7p2pXp/suyGRlDxWoQnR3IF4eneZStnviSeIUKWOSHY="],
    stakingTime: 1000,
    stakingValue: 10000,
    stakingTx:
      "AgAAAAABAcs8Fh4qI/qKkQaIx55/7fBzlgeRoipxqNMELWmkBR0ZAQAAAAD9////AxAnAAAAAAAAIlEgIUqqWY1jy1XVGqF8fswK48ZjUlXjGPCa6yYmsng/DXgAAAAAAAAAAElqR2JidDAANYgY8hT82dTMxClskHnsJe1ECw30rMNL7ap2wsGVWhnunalen+y7IZGUPFahCdHcgXh6d5lK2e+JJ4hQpY5IdgPowXsWAAAAAAAiUSBTvqaj6HwAyoz/8OvMU6zyrkWQ4gjz9Pa2cZxTXBZlKQFA0uim8eizk+pW90YI0Bt/yV6jJPdiOE9ief3rKvKHoUlIGwKnFHap9k+JLs9je//JKANjD15I/t7+DUzw1JtNU3J4AwA=",
    stakingTxInclusionProof: {
      key: {
        index: 182,
        hash: "kFJzEOcdOpI/twNJ9K/qsIXWbu0TDYOkTV29bIIAAAA=",
      },
      proof:
        "QmFz1hg6euFbROHG0FJwspulsAUBYJu6xLvFjewWxGy5Fyv+TjCQ61lgUQ9mi99On/Q4WB7olRoeI7dOhn4Vh3012zkV3b5WFA30MfHfO2T9gnrQiX1JSEWEsDZec3ZszEU5baFuvcl9sZD3zxgNdoAneVZU6CMdp63+v7domlrHUlVKngByzPuMsm8u8kP/TwRQgBXVvo1CIz1kF4jK+bCU6cAX7HGRNWZGE6Crkwya/eD0EqPCQPprXAthsNT3Oor7O3XpqZN6oHX18lZ5uF8I4QAhIm3uHd2nooKVbFk88z29qYnut37DZr+CT7PlmoVZblKCf7E2xtixv6QEwGNXV2LEjQTtNsG7mdK+R4KMW6m/81JXEnPhGMIiEzof",
    },
    slashingTx:
      "AgAAAAFdBMoQJzMp35XA5Cl2dJvGMwhfzlfQIUMQLEKzC8FniQAAAAAA/////wLoAwAAAAAAABYAFPhyg8oqsgoatQzHzqKQ9yLJokV0QB8AAAAAAAAiUSCrsqkEUVYlRmtxyynNJ/JKUjJ5RjBVhSIPMoBwgHJ8IgAAAAA=",
    delegatorSlashingSig:
      "SOsV2JX+1+PzWKv2KkLruMvvpHqMDQeACPVJ6uVgy3b4GzUfyYC/2Ex4w/b586Rfw3oHgddyg8l/t1/wjEqH9A==",
    unbondingTime: 5,
    unbondingTx:
      "AgAAAAFdBMoQJzMp35XA5Cl2dJvGMwhfzlfQIUMQLEKzC8FniQAAAAAA/////wEcJQAAAAAAACJRILIfdO4eRh6LFFYipA0GSMNcO3HB2cFpN9jmnl6PZeHrAAAAAA==",
    unbondingValue: 9500,
    unbondingSlashingTx:
      "AgAAAAEJMrSN+L+42iWwS1fzOQQr38zaEl0emM3/aVfWQVH+0wAAAAAA/////wK2AwAAAAAAABYAFPhyg8oqsgoatQzHzqKQ9yLJokV0fh0AAAAAAAAiUSCrsqkEUVYlRmtxyynNJ/JKUjJ5RjBVhSIPMoBwgHJ8IgAAAAA=",
    delegatorUnbondingSlashingSig:
      "MmYfm8tnhw34hrwvrUngxITsUJ8P3sOE5Ux3UyRhWqYcbZKrvFY+Jm/Bs8XDLa1HQ/W5LLuaaDZ1gMOBIQqIjQ==",
  }),
};
