# Babylon Bitcoin Staking - Usage Guide

This library follow the concepts of **pre-staking and post-staking registration flow**
based on this [documentation](https://github.com/babylonlabs-io/babylon/blob/release/v1.x/docs/register-bitcoin-stake.md)

## 1. Prerequisites

### 1.1 Staking Parameters

The Bitcoin Staking parameters define the conditions
that the Bitcoin Staking script and the Bitcoin Staking
transaction containing it must satisfy.
They are versioned parameters, with each version corresponding
to a range of Bitcoin heights.

You can retrieve the parameters as follows:
* By querying the `/babylon/btcstaking/v1/params` endpoint
  of an RPC/LCD node. You can find the available RPC/LCD nodes
  of each active network in the
  [Babylon networks repository](https://github.com/babylonlabs-io/networks).
* By querying the `/v2/network-info` endpoint of the [Babylon Staking API](https://docs.babylonlabs.io/api/staking-api/get-network-info/) that exposes the indexed Babylon parameters.

To learn more about the Bitcoin staking parameters and their usage in
constructing and validating Bitcoin Staking transactions, please refer to the
[specification](https://github.com/babylonlabs-io/babylon/blob/release/v1.x/docs/register-bitcoin-stake.md#32-babylon-chain-btc-staking-parameters).

### 1.2 Staker information

**Staker's Bitcoin Details**

The staker's Bitcoin address serves two key purposes within this library:
- Acts as the change address when creating Bitcoin staking transactions
- Serves as the withdrawal address when creating Bitcoin withdrawal transactions

The staker's Bitcoin public key is essential throughout the creation of all
Bitcoin transactions as it is used to construct the tapscript.

Staker inputs define the parameters for Bitcoin staking. Stakers can customize
their:
- Staking timelock duration
- Staking amount
- Preferred finality provider for delegation

```ts
const stakerInfo = {
  // BTC Address
  address: string,
  // BTC compressed public Key in the 32-byte x-coordinate only hex format.
  publicKeyNoCoordHex: string,
}

const stakerInput = {
  // The chosen finality provider public key in compressed 32 bytes x-coordinate
  // only
  finalityProviderPkNoCoordHex: string,
  // Amount of satoshis staker choose to stake
  stakingAmountSat: number,
  // The number of BTC blocks this staking transaction will be staked for
  stakingTimelock: number
}
```

**Staker's Babylon Genesis Details**

The Babylon Genesis address is used to create the Proof of Possession (POP),
which must be signed during the registration process.
The POP is used to confirms ownership of the Bitcoin key by the Babylon Genesis
account used for stake registration.

```ts
// Babylon bech32 address with prefix of `bbn`.
const babylonAddress = string
```

### 1.3 Signing Providers

A Provider is a construct that maintains a private key that can be used for
signing operations (e.g., a wallet).

For the purposes of this library, two providers are required:
- **Bitcoin Provider**: Responsible for signing Bitcoin transactions and
arbitrary messages through the ECDSA or BIP-322 algorithms.
- **Babylon Genesis Provider**: Responsible for signing Babylon Genesis
transactions. Babylon Genesis is based on Cosmos SDK, so providers that
support Cosmos SDK chains should be straightforward to adapt to Babylon Genesis.  

Below we define the expected interface for both of the above providers.

```ts
export interface BtcProvider {
  // Sign a PSBT
  signPsbt(signingStep: SigningStep, psbtHex: string): Promise<string>;
  // Sign a message using the ECDSA type
  // This is optional and only required if you would like to use the
  // `createProofOfPossession` function
  signMessage?: (
    signingStep: SigningStep, message: string, type: "ecdsa" || "bip322-simple"
  ) => Promise<string>;
}

export interface BabylonProvider {
  // Signs a Babylon chain transaction using the provided signing step.
  // This is primarily used for signing MsgCreateBTCDelegation transactions
  // which register the BTC delegation on the Babylon Genesis chain.
  signTransaction: <T extends object>(
    signingStep: SigningStep,
    msg: {
      typeUrl: string;
      value: T;
    }
  ) => Promise<Uint8Array>
}
```

## 2. Initialization

To use the library, you'll need to create an instance
of `BabylonBtcStakingManager` with the following required parameters:

```ts
import { BabylonBtcStakingManager } from "@babylonlabs-io/btc-staking-ts";

const manager = new BabylonBtcStakingManager(
  btcNetwork,      // Bitcoin network configuration (mainnet or testnet)
  stakingParams,   // Staking parameters retrieved as described in Prerequisites
  btcProvider,     // Bitcoin Provider for signing Bitcoin transactions
  bbnProvider      // Babylon Provider for signing Babylon Genesis transactions
);
```
The manager instance provides the necessary methods for creating and
managing Bitcoin staking transactions. Make sure you have all the prerequisites
(staking parameters and providers) properly configured before initializing the
manager.

## 3. Registration

Staker inputs, accounts information, combined with the staking parameters,
provide necessary elements for creating Bitcoin transactions that register
stakes on both the Babylon Genesis ledgers. These transactions include:
- BTC Staking Transaction: The Bitcoin transaction that locks the stake in
the self-custodial Bitcoin staking script.
- Slashing Transaction: A pre-signed transaction consenting to slashing in
case of double-signing.
- Unbonding Transaction: The on-demand unbonding transaction used to unlock
the stake before the originally committed timelock expires.
- Unbonding Slashing Transaction: A pre-signed transaction consenting to
slashing during the unbonding process in case of double-signing.

There are two types of registrations supported by Babylon Genesis chain in which
they fits for difference purpose/use-case.

If you already have an active Bitcoin staking transaction on the Bitcoin
network, you should choose **Post-Staking Registration**. Otherwise,
you should choose **Pre-Staking Registration**. The key difference is that
pre-staking registration requires validation from the Babylon Genesis chain
first, ensuring acceptance guarantees before submitting the staking transaction
to the Bitcoin network.

For more details about the two types, refer to the [Babylon node documentation](https://github.com/babylonlabs-io/babylon/blob/release/v1.x/docs/register-bitcoin-stake.md#2-bitcoin-stake-registration-methods)


### 3.1 Post-Staking Registration

This flow is for stakers who already have a confirmed BTC staking transaction
(k-blocks deep, where k is defined in the staking parameter)
and want to register it on the Babylon chain.
This process is particularly suitable for Babylon Phase-1 stakes.

It consists of multiple transactions and messages, some requiring 
signatures from the BTC Provider:
- Bitcoin staking transaction (already on the Bitcoin network)
- Bitcoin unbonding transaction
- Bitcoin slashing transaction (**requires signing**)
- Bitcoin slashing unbonding transaction (**requires signing**)
- Proof of Possession (**requires signing**)

The final constructed message will be signed by the Babylon Provider as a 
Babylon Genesis transaction, ready for submission to the network.

```ts
const {
  signedBabylonTx
} = await manager.postStakeRegistrationBabylonTransaction(
  stakerInfo,
  stakingTx,
  stakingHeight,
  stakingInput,
  inclusionProof, 
  bech32Address,
);
```

### 3.2 Pre-Staking Registration

The Pre-staking registration flow is for stakers who seek verification from the
Babylon chain before submitting their BTC staking transaction to the Bitcoin
ledger.

It consists of multiple transactions and messages, some requiring 
signatures from the BTC Provider:
- Bitcoin staking transaction
- Bitcoin unbonding transaction
- Bitcoin slashing transaction (**requires signing**)
- Bitcoin slashing unbonding transaction (**requires signing**)
- Proof of Possession (**requires signing**)

The final constructed message will be signed by the Babylon Provider as a 
Babylon Genesis transaction, ready for submission to the network.

```ts
const {
  signedBabylonTx
} = await manager.preStakeRegistrationBabylonTransaction(
  stakerInfo,
  stakingInput,
  babylonBtcTipHeight,
  inputUTXOs,
  feeRate,
  bech32Address,
);
```

## 4. Staking Transaction

> This step only relevant to `Pre-staking registration` in which the Bitcoin
> staking transaction has not been submitted to the Bitcoin network.

When constructing the Babylon Genesis transaction for `Pre-staking registration`,
an unsigned Bitcoin staking transaction should already been created. You can
retrieve the Bitcoin staking transaction:
- By querying the `/babylon/btcstaking/v1/btc_delegation/:staking_tx_hash_hex`
endpoint of an RPC/LCD node. For more details, see this [Babylon API documentation](https://docs.babylonlabs.io/api/babylon-gRPC/btc-delegation/)
- By queryign the `/v2/delegation?staking_tx_hash_hex=xxx` endpoint from the
Babylon Staking API. For more details, see this [Staking API documentation](https://docs.babylonlabs.io/api/staking-api/get-a-delegation/)

```ts
const signedBtcStakingTx = await manager.createSignedBtcStakingTransaction({
  stakerInfo,
  stakingInput,
  unsignedStakingTx,
  inputUTXOs,
  stakingParamsVersion
})
```

## 5. Unbonding Transaction

This step allows stakers to unbond their active staking transactions on demand
before the committed timelock expires. After unbonding, the funds will become
available for withdrawal once the unbonding period
(specified in the staking parameters) has elapsed.

The unbonding transaction requires signatures from both the staker and the
covenant committee. This step combines these signatures to create a complete
transaction ready for submission to the Bitcoin network.

You can retrieve the unsigned unbonding transaction and covenant committee
signatures through either:
- By querying the `/babylon/btcstaking/v1/btc_delegation/:staking_tx_hash_hex`
endpoint of an RPC/LCD node. For more details, see this [Babylon API documentation](https://docs.babylonlabs.io/api/babylon-gRPC/btc-delegation/)
- By queryign the `/v2/delegation?staking_tx_hash_hex=xxx` endpoint from the
Babylon Staking API. For more details, see this [Staking API documentation](https://docs.babylonlabs.io/api/staking-api/get-a-delegation/)

```ts
const { signedUnbondingTx } = await manager.createSignedBtcUnbondingTransaction({
  stakerInfo,
  stakingInput,
  stakingParamsVersion,
  stakingTx,
  unsignedUnbondingTx,
  covenantUnbondingSignatures
})
```

## 6. Withdraw

There are 3 different types of withdrawal transactions:
1. Withdraw from early unbonding (`createSignedBtcWithdrawEarlyUnbondedTransaction`)
   - Used when the unbonding period has passed
2. Withdraw from expired timelock (`createSignedBtcWithdrawStakingExpiredTransaction`)
   - Used when the staking period has naturally ended
3. Withdraw from slashed stake (`createSignedBtcWithdrawSlashingTransaction`)
   - Used when withdrawing slashed funds after timelock expiry

All withdrawal transactions will direct the change balance to the staker's
address (provided via `stakerInfo`).
For more customized transaction options, please refer to the [advanced usage documentation](docs/advanced-btc-tx.md).

The required input transaction varies depending on the withdrawal method:
- Early unbonding withdrawal requires the unbonding transaction
- Timelock expiry withdrawal requires the staking transaction
- Slashed stake withdrawal requires the slashing transaction

You can retrieve the Bitcoin staking transaction, unsigned unbonding transaction
, slashing transaction and staking input made at the time of creating the staking
transaction through either:
- By querying the `/babylon/btcstaking/v1/btc_delegation/:staking_tx_hash_hex`
endpoint of an RPC/LCD node. For more details, see this [Babylon API documentation](https://docs.babylonlabs.io/api/babylon-gRPC/btc-delegation/)
- By queryign the `/v2/delegation?staking_tx_hash_hex=xxx` endpoint from the
Babylon Staking API. For more details, see this [Staking API documentation](https://docs.babylonlabs.io/api/staking-api/get-a-delegation/)


```ts
// 1. Withdraw from early unbonding (when unbonding period has passed)
const signedWithdrawEarlyUnbondedTx = await manager.createSignedBtcWithdrawEarlyUnbondedTransaction({
  stakerInfo,
  stakingInput,
  stakingParamsVersion,
  unbondingTx, // Withdraw from unbonding transaction
  feeRate
})

// 2. Withdraw from expired timelock (when staking period has naturally ended)
const signedWithdrawTimelockExpiredTx = await manager.createSignedBtcWithdrawStakingExpiredTransaction({
  stakerInfo,
  stakingInput,
  stakingParamsVersion,
  stakingTx, // Withdraw from staking transaction
  feeRate
})

// 3. Withdraw from slashed Bitcoin Staking transaction (after timelock expiry)
const signedWithdrawSlashedTx = await manager.createSignedBtcWithdrawSlashingTransaction({
  stakerInfo,
  stakingInput,
  stakingParamsVersion,
  slashingTx, // Withdraw from slashing transaction
  feeRate
})
```

## 7. Fee Calculation

### 7.1 Bitcoin Transaction Fee
The library's fee calculation for Bitcoin transactions is based on an estimated
size of the transaction in virtual bytes (vB). This estimation helps in
calculating the appropriate fee to include in the transaction to ensure it is
processed by the Bitcoin network efficiently.

> **Note**: The fee estimation is only used for transactions in which the
> protocol allows to specify a custom fee, i.e., the staking and withdrawal
> transactions. The slashing and unbonding transactions have a pre-defined fee
> amount that should be used based on the Bitcoin Staking parameters utilized
> for the staking operation. Please refer to the
> [staking registration documentation](https://github.com/babylonlabs-io/babylon/blob/release/v1.x/docs/register-bitcoin-stake.md) for more details.

```ts
// Calculate the estimated fee for a staking transaction
const feeSats = manager.estimateBtcStakingFee({
  stakerInfo,
  babylonBtcTipHeight,
  stakingInput,
  inputUTXOs,
  feeRate
})
```

### 7.2 Babylon Genesis Transaction Fee
The current version of the library does not include functionality to calculate
Babylon Genesis transaction fees for `pre-staking registration`
and `post-staking registration` operations. This feature will be added in a
future release.
For now please refer to the [simple-staking example](https://github.com/babylonlabs-io/simple-staking/blob/main/src/app/hooks/client/rpc/mutation/useBbnTransaction.ts#L27). 