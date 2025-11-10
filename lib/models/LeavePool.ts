import dayjs, { Dayjs } from "dayjs";

import { deserializeToPeriod, Period } from "./Period";

export type LeavePool = {
  // Unique identifier for the pool
  id: number;
  // Name of the leave hours pool
  name: string;
  // More detailed description of what the pool represents
  description?: string;
  // Amount of leave hours to accrue per period
  amount: number;
  // Period of time between when amounts of leave hours are added
  period: Period;
  // Amount of leave hours that was in the pool at startDate
  startAmount: number;
  // Date that the accrual starts
  startDate: Dayjs;
  // TODO: Add support for the below parameters and their consequences.
  // // Date that hours expire on
  // rolloverDate?: Dayjs;
  // // Maximum amount of leave that can be stored in the pool
  // maxAmount?: number;
  // // Minimum amount of leave that can be stored in the pool
  // minAmount?: number;
  // // Amount of hours of leave used from this pool for any event must be a
  // // multiple of the given number, if not null.
  // requiredMultiple?: number;
};

type LeavePoolDtoOverrides = {
  period: string;
  startDate: string;
  // TODO: Add support for the below parameters and their consequences.
  // rolloverDate?: string;
};

export type LeavePoolDto = Omit<LeavePool, keyof LeavePoolDtoOverrides> & LeavePoolDtoOverrides

export const serializeToPoolDto = (pool: LeavePool): LeavePoolDto => {
  return {
    ...pool,
    period: pool.period.toString(),
    startDate: pool.startDate.toJSON(),
    // TODO: Add support for the below parameters and their consequences.
    // rolloverDate: pool.rolloverDate?.toJSON() || null,
  }
};

export const deserializeToPool = (pool: LeavePoolDto): LeavePool => ({
  ...pool,
  period: deserializeToPeriod(pool.period),
  startDate: dayjs(pool.startDate),
  // TODO: Add support for the below parameters and their consequences.
  // rolloverDate: dayjs(pool.rolloverDate),
});
