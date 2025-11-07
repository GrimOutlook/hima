import { Period, deserializeToPeriod } from "./Period";
import dayjs, { Dayjs } from "dayjs";

export type Pool = {
  // Unique identifier for the pool
  id: number;
  // Name of the leave hours pool
  name: string;
  // More detailed description of what the pool represents
  description: string;
  // Amount of leave hours to accrue per period
  amount: number;
  // Period of time between when amounts of leave hours are added
  period: Period;
  // Amount of leave hours that was in the pool at startDate
  startAmount: number;
  // Date that the accrual starts
  startDate: Dayjs;
  // Date that hours expire on
  rolloverDate: Dayjs | null;
  // Maximum amount of leave that can be stored in the pool
  maxAmount: number | null;
  // Minimum amount of leave that can be stored in the pool
  minAmount: number | null;
  // Amount of hours of leave used from this pool for any event must be a
  // multiple of the given number, if not null.
  requiredMultiple: number | null;
};

type PoolDtoOverrides = {
  period: string;
  startDate: string;
  rolloverDate: string | null;
};

export type PoolDto = Omit<Pool, keyof PoolDtoOverrides> & PoolDtoOverrides

export const serializeToPoolDto = (pool: Pool): PoolDto => {
  return {
    ...pool,
    period: pool.period.toString(),
    startDate: pool.startDate.toJSON(),
    rolloverDate: pool.rolloverDate?.toJSON() || null,
  }
};

export const deserializeToPool = (pool: PoolDto): Pool => ({
  ...pool,
  period: deserializeToPeriod(pool.period),
  startDate: dayjs(pool.startDate),
  rolloverDate: dayjs(pool.rolloverDate),
});
