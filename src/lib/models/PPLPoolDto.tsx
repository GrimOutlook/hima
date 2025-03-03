import Period from "./Period";
import { PPLPool } from "./PPLPool";

export type PPLPoolDto = {
    name: string;
    description: string;
    amount: number;
    period: Period;
    startDate: string;
    startAmount: number;
}

export const Serialize = (pool: PPLPool): PPLPoolDto => ({
    name: pool.name,
    description: pool.description,
    amount: pool.amount,
    period: pool.period,
    startDate: pool.startDate.toJSON(),
    startAmount: pool.startAmount
})