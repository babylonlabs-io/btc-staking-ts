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

# Babylon Bitcoin Staking - Usage Guide

## Table of Contents

- [1. Prerequisites](./docs/usage.md#1-prerequisites)
  - [1.1 Staking Parameters](./docs/usage.md#11-staking-parameters)
  - [1.2 Staker Information](./docs/usage.md#12-staker-information)
  - [1.3 Signing Providers](./docs/usage.md#13-signing-providers)
- [2. Initialization](./docs/usage.md#2-initialization)
- [3. Registration](./docs/usage.md#3-registration)
  - [3.1 Post-Staking Registration](./docs/usage.md#31-post-staking-registration)
  - [3.2 Pre-Staking Registration](./docs/usage.md#32-pre-staking-registration)
- [4. Staking Transaction](./docs/usage.md#4-staking-transaction)
- [5. Unbonding Transaction](./docs/usage.md#5-unbonding-transaction)
- [6. Withdrawal](./docs/usage.md#6-withdraw)
- [7. Fee Calculation](./docs/usage.md#7-fee-calculation)
  - [Bitcoin Transaction Fee](./docs/usage.md#71-bitcoin-transaction-fee)
  - [Babylon Genesis Transaction Fee](./docs/usage.md#72-babylon-genesis-transaction-fee)
