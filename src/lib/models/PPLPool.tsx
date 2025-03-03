import Period from "./Period";
import { PPLPoolDto } from "./PPLPoolDto";

export type PPLPool = {
    // Name of the PPL pool
    name: string;
    // More detailed description of 
    description: string;
    // Amount of PPL to accrue per period
    amount: number;
    // Period of time between when amounts of PPL accrue
    period: Period;
    // Date that the accrual starts
    startDate: Date;
    // Amount of PPL that was in the pool at startDate
    startAmount: number;
}


export const Deserialize = (pool: PPLPoolDto): PPLPool => ({
    name: pool.name,
    description: pool.description,
    amount: pool.amount,
    period: pool.period,
    startDate: new Date(pool.startDate),
    startAmount: pool.startAmount
})