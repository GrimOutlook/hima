import dayjs, { Dayjs } from "dayjs"

export type PoolTransaction = {
  // Date that the hours get added or removed from the pool
  date: Dayjs,
  // Hours taken from or added to the pool
  hours: number;
  // ID of the Pool that these hours effect
  poolId: number;
}

type PoolTransactionDtoOverrides = {
  date: string;
}

export type PoolTransactionDto = Omit<PoolTransaction, keyof PoolTransactionDtoOverrides> & PoolTransactionDtoOverrides;

export const serializeToPoolTransactionDto = (pt: PoolTransaction): PoolTransactionDto => ({
  ...pt,
  date: pt.date.toJSON(),
});

export const deserializeToPoolTransaction = (pt: PoolTransactionDto): PoolTransaction => ({
  ...pt,
  date: dayjs(pt.date),
});
