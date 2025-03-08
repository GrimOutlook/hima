import dayjs, { Dayjs } from "dayjs";
import { Period, DeserializeToPeriod } from "./Period";
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
}


export const DeserializeToPool = (pool: PPLPoolDto): PPLPool => ({
    id: pool.id,
    name: pool.name,
    description: pool.description,
    amount: pool.amount,
    period: DeserializeToPeriod(pool.period),
    startDate: dayjs(pool.startDate),
    startAmount: pool.startAmount
})