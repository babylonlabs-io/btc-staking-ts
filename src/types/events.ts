export type RegistrationStep =
  | "staking-slashing"
  | "unbonding-slashing"
  | "proof-of-possession"
  | "create-btc-delegation-msg";

export type WithdrawalType = "staking-expired" | "early-unbonded" | "slashing";

type EventData = any; // not implemented

// Events are emitted by manager and used for the staking dashboard UI only.
export interface ManagerEvents {
  "delegation:create": (step: RegistrationStep, data?: EventData) => void;
  "delegation:register": (step: RegistrationStep, data?: EventData) => void;
  "delegation:stake": (data?: EventData) => void;
  "delegation:unbond": (data?: EventData) => void;
  "delegation:withdraw": (type: WithdrawalType, data?: EventData) => void;
}

export type DelegationEvent = keyof ManagerEvents;
