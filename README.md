<p align="center">
    <img alt="Babylon Logo" src="https://github.com/user-attachments/assets/dc74271e-90f1-44bd-9122-2b7438ab375c" width="100" />
    <h3 align="center">@babylonlabs-io/btc-staking-ts</h3>
    <p align="center">Babylon Bitcoin Staking Protocol</p>
    <p align="center"><strong>TypeScript</strong> library</p>
    <p align="center">
      <a href="https://www.npmjs.com/package/@babylonlabs-io/btc-staking-ts"><img src="https://badge.fury.io/js/btc-staking-ts.svg" alt="npm version" height="18"></a>
    </p>
</p>
<br/>

## Installation

```console
npm i @babylonlabs-io/btc-staking-ts
```

## Version Release

### Stable version

Stable release versions are manually released from the main branch.

### Canary version

A canary version is a pre-release version from `dev` branch.
Make sure all changes are added and committed before running the command below:

```console
npm run version:canary
```

## Usage

> **Note**: This documentation describes an abstraction layer designed to simplify two main processes:
> 1. Creating Bitcoin staking delegations
> 2. Constructing data in the format required by the Babylon chain
>
> While this abstraction layer makes the process more straightforward, it comes with certain constraints:
> - Change address must be the same as the staker address
> - Transaction signing order is fixed
> - Limited customization options for transaction construction
> - Predefined fee calculation formulas
>
> These constraints help maintain security and reduce complexity for most use cases. However, if you need:
> - More flexibility in transaction construction
> - Custom change address management
> - Fine-grained control over signing order
> - Advanced transaction options
>
> Please refer to the [advanced usage documentation](docs/advanced-btc-tx.md) for lower-level implementation details.

This library follow the concepts of **pre-staking and post-staking registration flow**
based on this [documentation](https://github.com/babylonlabs-io/babylon/blob/main/docs/register-bitcoin-stake.md)

### Prerequisite

#### Staking Parameters
The Staking Parameters correspond to the parameters of the staking contract
and the Bitcoin transaction containing it. 

The parameter values can be retrieved from either:
- A [Babylon](https://github.com/babylonlabs-io/babylon) node
- The [backend API service](https://github.com/babylonlabs-io/staking-api-service)

We will be using the full list of staking parameters in this library, for detailed
explanation of each fields, refer to this [documentation](https://github.com/babylonlabs-io/babylon/blob/main/docs/register-bitcoin-stake.md#32-babylon-chain-btc-staking-parameters)

#### Staker information

The library require Staker's BTC as well as their Babylon Genesis Account 
information to be supplied in order to create the relevant transactions.

1. **Staker's Bitcoin and Babylon Details**
```ts
const stakerInfo = {
  address: "{{ Staker BTC address }}",
  publicKeyNoCoordHex: "{{ Staker BTC public key without coordinates in hex }}",
}

const babylonAddress = "{{ Babylon Genesis Chain bech32 Address }}"
```

as well the staking inputs selected/created by the staker at the time of creating
the delegation:

```ts
const stakerInput = {
  finalityProviderPkNoCoordHex: "{{ The chosen finality provider public key }}",
  stakingAmountSat: "{{ Amount of satoshis to stake }}",
  stakingTimelock: "{{ Timelock of the staking }}"
}
```

#### Providers

The library requires two provider implementations to handle transaction signing:

1. **Bitcoin Provider**: Handles Bitcoin transaction and message signing
2. **Babylon Provider**: Handles Babylon transaction signing

These providers are essential for constructing valid Babylon transaction 
messages, as certain message fields depend on the output of signed Bitcoin 
transactions. The `SigningStep` enum is used throughout the signing process to:
- Identify which signing operation is being performed
- Enable proper user interaction flows (e.g., showing relevant prompts)

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
  signTransaction: <T extends object>(
    signingStep: SigningStep,
    msg: {
      typeUrl: string;
      value: T;
    }
  ) => Promise<Uint8Array>
}
```

### Post-Staking Registration

This refers to registration of an already existing BTC staking transaction into Babylon
chain network. For more details, refer to [documentation](https://github.com/babylonlabs-io/babylon/blob/main/docs/register-bitcoin-stake.md#21-post-staking-registration).

> **Note**: This method does not create Bitcoin transactions that are ready to be sent to 
> the Bitcoin network. Instead, it creates Babylon transactions that contain the
> unsigned and partially signed Bitcoin transactions together with already 
> onchain staking transaction required for delegation registration.

```ts
import {
  BabylonBtcStakingManager,
} from "@babylonlabs-io/btc-staking-ts";

const manager = new BabylonBtcStakingManager(
  btcNetwork,
  stakingParams,
  btcProvider,
  bbnProvider,
);

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

### Pre-Staking Registration

The Pre-staking registration flow is for stakers who seek verification from the Babylon chain before submitting their BTC staking transaction to the Bitcoin ledger. For more details, refer to [documentation](https://github.com/babylonlabs-io/babylon/blob/main/docs/register-bitcoin-stake.md#22-pre-staking-registration)

> **Note**: This method does not create Bitcoin transactions that are ready to be sent to 
> the Bitcoin network. Instead, it creates Babylon transactions that contain the
> unsigned and partially signed Bitcoin transactions required for delegation 
> registration.


```ts
import {
  BabylonBtcStakingManager,
} from "@babylonlabs-io/btc-staking-ts";

const manager = new BabylonBtcStakingManager(
  btcNetwork,
  stakingParams,
  btcProvider,
  bbnProvider,
);

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

### Staking Transaction

This step signs the previously created (but unsigned) staking transaction, 
making it ready for submission to the Bitcoin network. The hash of the signed 
staking transaction must match the staking transaction hash contained within 
the pre-staking registration Babylon transaction.

The unsigned staking transaction can be retrieved from either the Babylon
chain or the backend API.

If you prefer to create a new Bitcoin staking transaction without first interacting with the
Babylon chain, please refer to the [advanced usage documentation](docs/advanced-btc-tx.md).


```ts
import {
  BabylonBtcStakingManager,
} from "@babylonlabs-io/btc-staking-ts";

const manager = new BabylonBtcStakingManager(
  btcNetwork,
  stakingParams,
  btcProvider,
  bbnProvider,
);

const signedBtcStakingTx = await manager.createSignedBtcStakingTransaction({
  stakerInfo,
  stakingInput,
  unsignedStakingTx,
  inputUTXOs,
  stakingParamsVersion
})
```
### Unbonding Transaction

This step signs the previously created (but unsigned) unbonding transaction and 
combines it with the signatures from covenants to create a properly signed 
unbonding transaction that is ready to be sent to the Bitcoin network to unbond 
a staking transaction.

The unsigned unbonding and staking transactions, as well as the covenant 
committee signatures, can be retrieved from either the Babylon Genesis Chain or 
backend API.

```ts
import {
  BabylonBtcStakingManager,
} from "@babylonlabs-io/btc-staking-ts";

const manager = new BabylonBtcStakingManager(
  btcNetwork,
  stakingParams,
  btcProvider,
  bbnProvider,
);

const { signedUnbondingTx } = await manager.createSignedBtcUnbondingTransaction({
  stakerInfo,
  stakingInput,
  stakingParamsVersion,
  stakingTx,
  unsignedUnbondingTx,
  covenantUnbondingSignatures
})
```

#### Withdraw

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

These transactions can be retrieved from either the Babylon Genesis Chain or the Backend API.

```ts
import {
  BabylonBtcStakingManager,
} from "@babylonlabs-io/btc-staking-ts";

const manager = new BabylonBtcStakingManager(
  btcNetwork,
  stakingParams,
  btcProvider,
  bbnProvider,
);

// 1. Withdraw from early unbonding (when unbonding period has passed)
const signedWithdrawEarlyUnbondedTx = await manager.createSignedBtcWithdrawEarlyUnbondedTransaction({
  stakerInfo,
  stakingInput,
  stakingParamsVersion,
  unbondingTx,
  feeRate
})

// 2. Withdraw from expired timelock (when staking period has naturally ended)
const signedWithdrawTimelockExpiredTx = await manager.createSignedBtcWithdrawStakingExpiredTransaction({
  stakerInfo,
  stakingInput,
  stakingParamsVersion,
  stakingTx,
  feeRate
})

// 3. Withdraw from slashed delegation (after timelock expiry)
const signedWithdrawSlashedTx = await manager.createSignedBtcWithdrawSlashingTransaction({
  stakerInfo,
  stakingInput,
  stakingParamsVersion,
  slashingTx,
  feeRate
})
```

#### Fee Calculation

The fee calculation in the @babylonlabs-io/btc-staking-ts library is based on 
an estimated size of the transaction in virtual bytes (vB). 
This estimation helps in calculating the appropriate fee to include in the 
transaction to ensure it is processed by the Bitcoin network efficiently.

The fee estimation formula used is:

```ts
numInputs * 180 + numOutputs * 34 + 10 + numInputs + 40
```

This accounts for:
- `180 vB` per input
- `34 vB` per output
- `10 vB` fixed buffer
- `numInputs` additional factor
- `40 vB` buffer for the op_return output

```ts
import {
  BabylonBtcStakingManager,
} from "@babylonlabs-io/btc-staking-ts";

const manager = new BabylonBtcStakingManager(
  btcNetwork,
  stakingParams,
  btcProvider,
  bbnProvider,
);

// Calculate the estimated fee for a staking transaction
const feeSats = manager.estimateBtcStakingFee({
  stakerInfo,
  babylonBtcTipHeight,
  stakingInput,
  inputUTXOs,
  feeRate
})
```
