import { btcstakingtx } from "@babylonlabs-io/babylon-proto-ts";
import {
  getPublicKeyNoCoord,
  VersionedStakingParams,
  type UTXO,
} from "../../../../src";

export const params: VersionedStakingParams[] = [
  {
    version: 0,
    covenant_pks: [
      "d45c70d28f169e1f0c7f4a78e2bc73497afe585b70aa897955989068f3350aaa",
      "4b15848e495a3a62283daaadb3f458a00859fe48e321f0121ebabbdd6698f9fa",
      "23b29f89b45f4af41588dcaf0ca572ada32872a88224f311373917f1b37d08d1",
      "d3c79b99ac4d265c2f97ac11e3232c07a598b020cf56c6f055472c893c0967ae",
      "8242640732773249312c47ca7bdb50ca79f15f2ecc32b9c83ceebba44fb74df7",
      "e36200aaa8dce9453567bba108bdc51f7f1174b97a65e4dc4402fc5de779d41c",
      "cbdd028cfe32c1c1f2d84bfec71e19f92df509bba7b8ad31ca6c1a134fe09204",
      "f178fcce82f95c524b53b077e6180bd2d779a9057fdff4255a0af95af918cee0",
      "de13fc96ea6899acbdc5db3afaa683f62fe35b60ff6eb723dad28a11d2b12f8c",
    ],
    covenant_quorum: 6,
    min_staking_value_sat: 500000,
    max_staking_value_sat: 5000000,
    min_staking_time_blocks: 64000,
    max_staking_time_blocks: 64000,
    slashing_pk_script: "6a07626162796c6f6e",
    min_slashing_tx_fee_sat: 100000,
    slashing_rate: "0.001000000000000000",
    unbonding_time_blocks: 1008,
    unbonding_fee_sat: 64000,
    min_commission_rate: "0.030000000000000000",
    max_active_finality_providers: 0,
    delegation_creation_base_gas_fee: 1095000,
    allow_list_expiration_height: 139920,
    btc_activation_height: 857910,
  },
  {
    version: 1,
    covenant_pks: [
      "d45c70d28f169e1f0c7f4a78e2bc73497afe585b70aa897955989068f3350aaa",
      "4b15848e495a3a62283daaadb3f458a00859fe48e321f0121ebabbdd6698f9fa",
      "23b29f89b45f4af41588dcaf0ca572ada32872a88224f311373917f1b37d08d1",
      "d3c79b99ac4d265c2f97ac11e3232c07a598b020cf56c6f055472c893c0967ae",
      "8242640732773249312c47ca7bdb50ca79f15f2ecc32b9c83ceebba44fb74df7",
      "e36200aaa8dce9453567bba108bdc51f7f1174b97a65e4dc4402fc5de779d41c",
      "cbdd028cfe32c1c1f2d84bfec71e19f92df509bba7b8ad31ca6c1a134fe09204",
      "f178fcce82f95c524b53b077e6180bd2d779a9057fdff4255a0af95af918cee0",
      "de13fc96ea6899acbdc5db3afaa683f62fe35b60ff6eb723dad28a11d2b12f8c",
    ],
    covenant_quorum: 6,
    min_staking_value_sat: 500000,
    max_staking_value_sat: 50000000000,
    min_staking_time_blocks: 64000,
    max_staking_time_blocks: 64000,
    slashing_pk_script: "6a07626162796c6f6e",
    min_slashing_tx_fee_sat: 100000,
    slashing_rate: "0.001000000000000000",
    unbonding_time_blocks: 1008,
    unbonding_fee_sat: 32000,
    min_commission_rate: "0.030000000000000000",
    max_active_finality_providers: 0,
    delegation_creation_base_gas_fee: 1095000,
    allow_list_expiration_height: 139920,
    btc_activation_height: 864790,
  },
  {
    version: 2,
    covenant_pks: [
      "d45c70d28f169e1f0c7f4a78e2bc73497afe585b70aa897955989068f3350aaa",
      "4b15848e495a3a62283daaadb3f458a00859fe48e321f0121ebabbdd6698f9fa",
      "23b29f89b45f4af41588dcaf0ca572ada32872a88224f311373917f1b37d08d1",
      "d3c79b99ac4d265c2f97ac11e3232c07a598b020cf56c6f055472c893c0967ae",
      "8242640732773249312c47ca7bdb50ca79f15f2ecc32b9c83ceebba44fb74df7",
      "e36200aaa8dce9453567bba108bdc51f7f1174b97a65e4dc4402fc5de779d41c",
      "cbdd028cfe32c1c1f2d84bfec71e19f92df509bba7b8ad31ca6c1a134fe09204",
      "f178fcce82f95c524b53b077e6180bd2d779a9057fdff4255a0af95af918cee0",
      "de13fc96ea6899acbdc5db3afaa683f62fe35b60ff6eb723dad28a11d2b12f8c",
    ],
    covenant_quorum: 6,
    min_staking_value_sat: 500000,
    max_staking_value_sat: 500000000000,
    min_staking_time_blocks: 64000,
    max_staking_time_blocks: 64000,
    slashing_pk_script: "6a07626162796c6f6e",
    min_slashing_tx_fee_sat: 100000,
    slashing_rate: "0.001000000000000000",
    unbonding_time_blocks: 1008,
    unbonding_fee_sat: 32000,
    min_commission_rate: "0.030000000000000000",
    max_active_finality_providers: 0,
    delegation_creation_base_gas_fee: 1095000,
    allow_list_expiration_height: 139920,
    btc_activation_height: 874088,
  },
  {
    version: 3,
    covenant_pks: [
      "d45c70d28f169e1f0c7f4a78e2bc73497afe585b70aa897955989068f3350aaa",
      "4b15848e495a3a62283daaadb3f458a00859fe48e321f0121ebabbdd6698f9fa",
      "23b29f89b45f4af41588dcaf0ca572ada32872a88224f311373917f1b37d08d1",
      "d3c79b99ac4d265c2f97ac11e3232c07a598b020cf56c6f055472c893c0967ae",
      "8242640732773249312c47ca7bdb50ca79f15f2ecc32b9c83ceebba44fb74df7",
      "e36200aaa8dce9453567bba108bdc51f7f1174b97a65e4dc4402fc5de779d41c",
      "f178fcce82f95c524b53b077e6180bd2d779a9057fdff4255a0af95af918cee0",
      "de13fc96ea6899acbdc5db3afaa683f62fe35b60ff6eb723dad28a11d2b12f8c",
      "cbdd028cfe32c1c1f2d84bfec71e19f92df509bba7b8ad31ca6c1a134fe09204",
    ],
    covenant_quorum: 6,
    min_staking_value_sat: 500000,
    max_staking_value_sat: 500000000000,
    min_staking_time_blocks: 64000,
    max_staking_time_blocks: 64000,
    slashing_pk_script: "6a07626162796c6f6e",
    min_slashing_tx_fee_sat: 100000,
    slashing_rate: "0.001000000000000000",
    unbonding_time_blocks: 1008,
    unbonding_fee_sat: 32000,
    min_commission_rate: "0.030000000000000000",
    max_active_finality_providers: 0,
    delegation_creation_base_gas_fee: 1095000,
    allow_list_expiration_height: 139920,
    btc_activation_height: 891425,
  },
  {
    version: 4,
    covenant_pks: [
      "d45c70d28f169e1f0c7f4a78e2bc73497afe585b70aa897955989068f3350aaa",
      "4b15848e495a3a62283daaadb3f458a00859fe48e321f0121ebabbdd6698f9fa",
      "23b29f89b45f4af41588dcaf0ca572ada32872a88224f311373917f1b37d08d1",
      "d3c79b99ac4d265c2f97ac11e3232c07a598b020cf56c6f055472c893c0967ae",
      "8242640732773249312c47ca7bdb50ca79f15f2ecc32b9c83ceebba44fb74df7",
      "e36200aaa8dce9453567bba108bdc51f7f1174b97a65e4dc4402fc5de779d41c",
      "f178fcce82f95c524b53b077e6180bd2d779a9057fdff4255a0af95af918cee0",
      "de13fc96ea6899acbdc5db3afaa683f62fe35b60ff6eb723dad28a11d2b12f8c",
      "cbdd028cfe32c1c1f2d84bfec71e19f92df509bba7b8ad31ca6c1a134fe09204",
    ],
    covenant_quorum: 6,
    min_staking_value_sat: 500000,
    max_staking_value_sat: 500000000000,
    min_staking_time_blocks: 64000,
    max_staking_time_blocks: 64000,
    slashing_pk_script: "6a07626162796c6f6e",
    min_slashing_tx_fee_sat: 100000,
    slashing_rate: "0.001000000000000000",
    unbonding_time_blocks: 1008,
    unbonding_fee_sat: 9600,
    min_commission_rate: "0.030000000000000000",
    max_active_finality_providers: 0,
    delegation_creation_base_gas_fee: 1095000,
    allow_list_expiration_height: 139920,
    btc_activation_height: 893362,
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
    "0874876147fd7522d617e83bf845f7fb4981520e3c2f749ad4a2ca1bd660ef0c",
  ),
  address: "tb1plqg44wluw66vpkfccz23rdmtlepnx2m3yef57yyz66flgxdf4h8q7wu6pf",
};

export const babylonAddress = "bbn1cyqgpk0nlsutlm5ymkfpya30fqntanc8slpure";

export const stakingInput = {
  stakingAmountSat: 500_000,
  finalityProviderPkNoCoordHex: getPublicKeyNoCoord(
    "d23c2c25e1fcf8fd1c21b9a402c19e2e309e531e45e92fb1e9805b6056b0cc76",
  ),
  stakingTimelock: 64000,
};

export const utxos: UTXO[] = [
  {
    scriptPubKey:
      "5120f8115abbfc76b4c0d938c09511b76bfe43332b7126534f1082d693f419a9adce",
    txid: "226a8c02e28ff47a8ea3e6cf2612768071ecb1c40e5b5a5ccc3bdc3e538d6dd6",
    value: 8586757,
    vout: 1,
  },
];

export const btcTipHeight = 900_000;
export const invalidStartHeightArr = [
  [0, "Babylon BTC tip height cannot be 0"],
  [800_000, "Babylon params not found for height 800000"],
] as [number, string][];

export const feeRate = 4;

export const slashingPsbt =
  "70736274ff010070020000000197e5f77c011a657e5f3aa24d46c1b3e4949980a8e30b5d5555bfdbb929a7fae90000000000ffffffff02f401000000000000096a07626162796c6f6e8c180600000000002251208c4b66479c64625efc30e0bc53c7df68173d3a444fdc0847e6a3ae4de1ab6add000000000001012b20a1070000000000225120745e0394730bd20a0a790069eeb28b4da95f73ea1d121374a299d8da9cb6d0934215c150929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac07ffc89a815b7b26da44c800e92dcf548694fd65486abe250fb6f7b30b73b2286fd7901200874876147fd7522d617e83bf845f7fb4981520e3c2f749ad4a2ca1bd660ef0cad20d23c2c25e1fcf8fd1c21b9a402c19e2e309e531e45e92fb1e9805b6056b0cc76ad2023b29f89b45f4af41588dcaf0ca572ada32872a88224f311373917f1b37d08d1ac204b15848e495a3a62283daaadb3f458a00859fe48e321f0121ebabbdd6698f9faba208242640732773249312c47ca7bdb50ca79f15f2ecc32b9c83ceebba44fb74df7ba20cbdd028cfe32c1c1f2d84bfec71e19f92df509bba7b8ad31ca6c1a134fe09204ba20d3c79b99ac4d265c2f97ac11e3232c07a598b020cf56c6f055472c893c0967aeba20d45c70d28f169e1f0c7f4a78e2bc73497afe585b70aa897955989068f3350aaaba20de13fc96ea6899acbdc5db3afaa683f62fe35b60ff6eb723dad28a11d2b12f8cba20e36200aaa8dce9453567bba108bdc51f7f1174b97a65e4dc4402fc5de779d41cba20f178fcce82f95c524b53b077e6180bd2d779a9057fdff4255a0af95af918cee0ba569cc001172050929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0000000";
export const unbondingSlashingPsbt =
  "70736274ff010070020000000151c1c42cbc4b725a5fa513ba3f10c1f6b5b6225f6446cd5ca61ea7e2e8dfdaea0000000000ffffffff02ea01000000000000096a07626162796c6f6e16f30500000000002251208c4b66479c64625efc30e0bc53c7df68173d3a444fdc0847e6a3ae4de1ab6add000000000001012ba07b070000000000225120655759c640a9d374e949e6e2cefdb6bee32e54b7dac9a0995fe508a04b3fd2cd4215c150929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0010700255627c84b08e73ce57938ce8e6b01de0613e3a9dbb7216e9095d9129cfd7901200874876147fd7522d617e83bf845f7fb4981520e3c2f749ad4a2ca1bd660ef0cad20d23c2c25e1fcf8fd1c21b9a402c19e2e309e531e45e92fb1e9805b6056b0cc76ad2023b29f89b45f4af41588dcaf0ca572ada32872a88224f311373917f1b37d08d1ac204b15848e495a3a62283daaadb3f458a00859fe48e321f0121ebabbdd6698f9faba208242640732773249312c47ca7bdb50ca79f15f2ecc32b9c83ceebba44fb74df7ba20cbdd028cfe32c1c1f2d84bfec71e19f92df509bba7b8ad31ca6c1a134fe09204ba20d3c79b99ac4d265c2f97ac11e3232c07a598b020cf56c6f055472c893c0967aeba20d45c70d28f169e1f0c7f4a78e2bc73497afe585b70aa897955989068f3350aaaba20de13fc96ea6899acbdc5db3afaa683f62fe35b60ff6eb723dad28a11d2b12f8cba20e36200aaa8dce9453567bba108bdc51f7f1174b97a65e4dc4402fc5de779d41cba20f178fcce82f95c524b53b077e6180bd2d779a9057fdff4255a0af95af918cee0ba569cc001172050929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0000000";
export const stakingTxHex =
  "0200000001d66d8d533edc3bcc5c5a5b0ec4b1ec7180761226cfe6a38e7af48fe2028c6a220100000000ffffffff0220a1070000000000225120745e0394730bd20a0a790069eeb28b4da95f73ea1d121374a299d8da9cb6d09379627b0000000000225120f8115abbfc76b4c0d938c09511b76bfe43332b7126534f1082d693f419a9adce00000000";
export const signedBabylonAddress =
  "AUDG4E+rqWGwxtqAl3YuIY8vZ81qCbuLChpdQ7t0xxKpI8+TxXqeJzer8iNOtDbcKddhl8QDL5+1LQ70GsvEtF2t";
export const signedSlashingPsbt =
  "70736274ff010070020000000197e5f77c011a657e5f3aa24d46c1b3e4949980a8e30b5d5555bfdbb929a7fae90000000000ffffffff02f401000000000000096a07626162796c6f6e8c180600000000002251208c4b66479c64625efc30e0bc53c7df68173d3a444fdc0847e6a3ae4de1ab6add000000000001012b20a1070000000000225120745e0394730bd20a0a790069eeb28b4da95f73ea1d121374a299d8da9cb6d0930108fdff0103400fceade8b5e88c87305dda3a821e93916a0295c32fd9ad87e8b60fddc931a6aea4a78c690c979489a52dff8185c984d3e3a41bcd017d9633b2f744adb567d7f6fd7801200874876147fd7522d617e83bf845f7fb4981520e3c2f749ad4a2ca1bd660ef0cad20d23c2c25e1fcf8fd1c21b9a402c19e2e309e531e45e92fb1e9805b6056b0cc76ad2023b29f89b45f4af41588dcaf0ca572ada32872a88224f311373917f1b37d08d1ac204b15848e495a3a62283daaadb3f458a00859fe48e321f0121ebabbdd6698f9faba208242640732773249312c47ca7bdb50ca79f15f2ecc32b9c83ceebba44fb74df7ba20cbdd028cfe32c1c1f2d84bfec71e19f92df509bba7b8ad31ca6c1a134fe09204ba20d3c79b99ac4d265c2f97ac11e3232c07a598b020cf56c6f055472c893c0967aeba20d45c70d28f169e1f0c7f4a78e2bc73497afe585b70aa897955989068f3350aaaba20de13fc96ea6899acbdc5db3afaa683f62fe35b60ff6eb723dad28a11d2b12f8cba20e36200aaa8dce9453567bba108bdc51f7f1174b97a65e4dc4402fc5de779d41cba20f178fcce82f95c524b53b077e6180bd2d779a9057fdff4255a0af95af918cee0ba569c41c150929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac07ffc89a815b7b26da44c800e92dcf548694fd65486abe250fb6f7b30b73b2286000000";
export const signedUnbondingSlashingPsbt =
  "70736274ff010070020000000151c1c42cbc4b725a5fa513ba3f10c1f6b5b6225f6446cd5ca61ea7e2e8dfdaea0000000000ffffffff02ea01000000000000096a07626162796c6f6e16f30500000000002251208c4b66479c64625efc30e0bc53c7df68173d3a444fdc0847e6a3ae4de1ab6add000000000001012ba07b070000000000225120655759c640a9d374e949e6e2cefdb6bee32e54b7dac9a0995fe508a04b3fd2cd0108fdff01034042d62d7dc274006463429df97d6e633dc98ea77f09ac3ce49d487fe06ac5beae2899b451891580cfa5a68f227aa63d15995dce710d44918a47fd1220525393a4fd7801200874876147fd7522d617e83bf845f7fb4981520e3c2f749ad4a2ca1bd660ef0cad20d23c2c25e1fcf8fd1c21b9a402c19e2e309e531e45e92fb1e9805b6056b0cc76ad2023b29f89b45f4af41588dcaf0ca572ada32872a88224f311373917f1b37d08d1ac204b15848e495a3a62283daaadb3f458a00859fe48e321f0121ebabbdd6698f9faba208242640732773249312c47ca7bdb50ca79f15f2ecc32b9c83ceebba44fb74df7ba20cbdd028cfe32c1c1f2d84bfec71e19f92df509bba7b8ad31ca6c1a134fe09204ba20d3c79b99ac4d265c2f97ac11e3232c07a598b020cf56c6f055472c893c0967aeba20d45c70d28f169e1f0c7f4a78e2bc73497afe585b70aa897955989068f3350aaaba20de13fc96ea6899acbdc5db3afaa683f62fe35b60ff6eb723dad28a11d2b12f8cba20e36200aaa8dce9453567bba108bdc51f7f1174b97a65e4dc4402fc5de779d41cba20f178fcce82f95c524b53b077e6180bd2d779a9057fdff4255a0af95af918cee0ba569c41c150929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0010700255627c84b08e73ce57938ce8e6b01de0613e3a9dbb7216e9095d9129c000000";
export const delegationMsg = {
  typeUrl: "/babylon.btcstaking.v1.MsgCreateBTCDelegation",
  value: btcstakingtx.MsgCreateBTCDelegation.fromJSON({
    stakerAddr: "bbn1cyqgpk0nlsutlm5ymkfpya30fqntanc8slpure",
    pop: {
      btcSigType: "BIP322",
      btcSig:
        "Cj50YjFwbHFnNDR3bHV3NjZ2cGtmY2N6MjNyZG10bGVwbngybTN5ZWY1N3l5ejY2ZmxneGRmNGg4cTd3dTZwZhJCAUDG4E+rqWGwxtqAl3YuIY8vZ81qCbuLChpdQ7t0xxKpI8+TxXqeJzer8iNOtDbcKddhl8QDL5+1LQ70GsvEtF2t",
    },
    btcPk: "CHSHYUf9dSLWF+g7+EX3+0mBUg48L3Sa1KLKG9Zg7ww=",
    fpBtcPkList: ["0jwsJeH8+P0cIbmkAsGeLjCeUx5F6S+x6YBbYFawzHY="],
    stakingTime: 64000,
    stakingValue: 500000,
    stakingTx:
      "AgAAAAHWbY1TPtw7zFxaWw7EsexxgHYSJs/mo4569I/iAoxqIgEAAAAA/////wIgoQcAAAAAACJRIHReA5RzC9IKCnkAae6yi02pX3PqHRITdKKZ2NqcttCTeWJ7AAAAAAAiUSD4EVq7/Ha0wNk4wJURt2v+QzMrcSZTTxCC1pP0GamtzgAAAAA=",
    slashingTx:
      "AgAAAAGX5fd8ARplfl86ok1GwbPklJmAqOMLXVVVv9u5Kaf66QAAAAAA/////wL0AQAAAAAAAAlqB2JhYnlsb26MGAYAAAAAACJRIIxLZkecZGJe/DDgvFPH32gXPTpET9wIR+ajrk3hq2rdAAAAAA==",
    delegatorSlashingSig:
      "D86t6LXojIcwXdo6gh6TkWoClcMv2a2H6LYP3ckxpq6kp4xpDJeUiaUt/4GFyYTT46QbzQF9ljOy90SttWfX9g==",
    unbondingTime: 1008,
    unbondingTx:
      "AgAAAAGX5fd8ARplfl86ok1GwbPklJmAqOMLXVVVv9u5Kaf66QAAAAAA/////wGgewcAAAAAACJRIGVXWcZAqdN06Unm4s79tr7jLlS32smgmV/lCKBLP9LNAAAAAA==",
    unbondingValue: 490400,
    unbondingSlashingTx:
      "AgAAAAFRwcQsvEtyWl+lE7o/EMH2tbYiX2RGzVymHqfi6N/a6gAAAAAA/////wLqAQAAAAAAAAlqB2JhYnlsb24W8wUAAAAAACJRIIxLZkecZGJe/DDgvFPH32gXPTpET9wIR+ajrk3hq2rdAAAAAA==",
    delegatorUnbondingSlashingSig:
      "QtYtfcJ0AGRjQp35fW5jPcmOp38JrDzknUh/4GrFvq4ombRRiRWAz6WmjyJ6pj0VmV3OcQ1EkYpH/RIgUlOTpA==",
  }),
};
