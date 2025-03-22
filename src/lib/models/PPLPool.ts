import { Period, deserializeToPeriod } from "./Period";
import dayjs, { Dayjs } from "dayjs";
import { PPLPoolDto } from "./PPLPoolDto";

export type PPLPool = {
  // Unique identifier for the pool
  id: number;
  // Name of the PPL pool
  name: string;
  // More detailed description of
  description: string;
  // Amount of PPL to accrue per period
  amount: number;
  // Period of time between when amounts of PPL accrue
  period: Period;
  // Date that the accrual starts
  startDate: Dayjs;
  // Amount of PPL that was in the pool at startDate
  startAmount: number;
};

export const deserializeToPool = (pool: PPLPoolDto): PPLPool => ({
  amount: pool.amount,
  description: pool.description,
  id: pool.id,
  name: pool.name,
  period: deserializeToPeriod(pool.period),
  startAmount: pool.startAmount,
  startDate: dayjs(pool.startDate),
});
