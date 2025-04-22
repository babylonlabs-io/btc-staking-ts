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

This library follows a **trunk-based release workflow**, where all development happens on the `main` branch, and versioned releases are cut from dedicated `release/*` branches.

For more details, please refer to the [Babylon Release Process](https://github.com/babylonlabs-io/babylon/blob/main/RELEASE_PROCESS.md). 

### Stable Version

Stable releases are created **only** from release branches such as `release/v1.x`.  
These branches represent production-ready versions, and all semantic versioning (major/minor/patch) is applied from them.

### Development Branch

The `main` branch is the active development branch where all new changes are merged. It may contain features or updates not yet included in a stable release.

#### Canary Version

Canary versions are optional pre-releases used for testing. They may be published manually from the `main` branch before a stable release is cut.

To publish a canary version, ensure update the package.json version to include `-canary.xyz`, then trigger the release pipeline from github action

## Usage Guide

Details on the usage of the library can be found
on the [usage guide](./docs/usage.md).
