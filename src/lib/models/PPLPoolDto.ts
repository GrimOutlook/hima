import { PPLPool } from "./PPLPool";

export type PPLPoolDto = {
    id: number;
    name: string;
    description: string;
    amount: number;
    period: string;
    startDate: string;
    startAmount: number;
}

export const SerializeToPoolDto = (pool: PPLPool): PPLPoolDto => ({
    id: pool.id,
    name: pool.name,
    description: pool.description,
    amount: pool.amount,
    period: pool.period.toString(),
    startDate: pool.startDate.toJSON(),
    startAmount: pool.startAmount
})