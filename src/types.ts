export const NTH_WEEKDAYS = ["First", "Second", "Third", "Fourth", "Fifth", "Last"] as const;
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;
export const CADENCES = ["Weekly", "Fortnightly", "Monthly", "Yearly", "YearlyNthWeekday"] as const;
export const STORE_VERSION = 1;
export const MAX_POOL_NAME_LENGTH = 48;
export const MAX_EVENT_NAME_LENGTH = 64;

export type NthWeekday = typeof NTH_WEEKDAYS[number];
export type Weekday = typeof WEEKDAYS[number];
export type Cadence = typeof CADENCES[number];

export interface OneTimeAddition {
  id: number;
  reset?: boolean;
  expires_same_day?: boolean;
  amount: number;
  date: string;
}

export interface RecurringAddition {
  id: number;
  reset?: boolean;
  expires_same_day?: boolean;
  amount: number;
  cadence: Cadence;
  start_date: string;
  end_date?: string;
  month?: number;
  nth_weekday?: NthWeekday;
  weekday?: Weekday;
}

export interface PoolCap {
  id: number;
  max_balance: number;
  start_date: string;
  end_date?: string;
}

export interface Pool {
  new_additions_expire_same_day?: boolean;
  color?: string;
  id: number;
  name: string;
  hidden_from_graph?: boolean;
  hidden_from_total?: boolean;
  additions: OneTimeAddition[];
  recurring: RecurringAddition[];
  caps: PoolCap[];
}

export interface PoolAllocation {
  pool_id: number;
  hours: number;
}

export interface LeaveDay {
  date: string;
  allocations: PoolAllocation[];
}

export interface LeaveEvent {
  id: number;
  name: string;
  days: LeaveDay[];
}

export interface Store {
  version: typeof STORE_VERSION;
  pools: Pool[];
  events: LeaveEvent[];
  next_id: number;
}

export interface EventDayInput {
  date: string;
  allocations: PoolAllocationInput[];
}

export interface PoolAllocationInput {
  pool_id: number;
  hours: string;
}

export interface BalancePoint {
  date: string;
  balance: number;
  projected: boolean;
}

export interface PoolFormData {
  name: string;
  openingAmount: string;
  openingDate: string;
  hiddenFromGraph: boolean;
  hiddenFromTotal: boolean;
  color?: string;
  newAdditionsExpireSameDay?: boolean;
}

export interface AdditionFormData {
  additionalEntries?: { amount: number; date: string }[];
  reset: boolean;
  expiresSameDay?: boolean;
  amount: number;
  date: string;
  recurring: boolean;
  cadence: Cadence;
  endDate?: string;
  month?: number;
  nthWeekday?: NthWeekday;
  weekday?: Weekday;
}

export type PoolCapFormData = Omit<PoolCap, "id"> & { id?: number };

export type StoreAction =
  | (PoolFormData & { type: "save-pool"; poolId?: number })
  | { type: "save-cap"; poolId: number; capId?: number; cap: PoolCapFormData }
  | { type: "save-addition"; poolId: number; target?: { type: "one-time" | "recurring"; id: number }; form: AdditionFormData }
  | { type: "save-event"; eventId?: number; name: string; days: LeaveDay[] }
  | { type: "remove-pool"; poolId: number }
  | { type: "remove-addition"; poolId: number; additionId: number; recurring: boolean }
  | { type: "remove-cap"; poolId: number; capId: number }
  | { type: "remove-event"; eventId: number }
  | { type: "reorder-pool"; poolId: number; targetId: number }
  | { type: "set-pool-visibility"; poolId: number; visible: boolean };
