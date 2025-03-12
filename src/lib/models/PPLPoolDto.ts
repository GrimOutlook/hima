import { PPLPool } from "./PPLPool";

export type PPLPoolDto = {
  id: number;
  name: string;
  description: string;
  amount: number;
  period: string;
  startDate: string;
  startAmount: number;
};

export const serializeToPoolDto = (pool: PPLPool): PPLPoolDto => ({
  amount: pool.amount,
  description: pool.description,
  id: pool.id,
  name: pool.name,
  period: pool.period.toString(),
  startAmount: pool.startAmount,
  startDate: pool.startDate.toJSON(),
});
