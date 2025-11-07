import { Dayjs } from "dayjs"

export type PoolTransaction = {
  // Date that the hours get added or removed from the pool
  date: Dayjs,
  // Hours taken from or added to the pool
  hours: number;
  // ID of the Pool that these hours effect
  poolId: number;
}
