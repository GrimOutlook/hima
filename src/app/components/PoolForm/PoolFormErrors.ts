import { PoolFormDataDto } from "@/lib/models/PoolFormDto";
import { periods } from "@/lib/models/Period";

export enum PoolFormErrors {
  NAME = 1,
  AMOUNT = 2,
  PERIOD = 4,
  START_DATE = 8,
  START_AMOUNT = 16,
}

export const fieldIsValid = (
  error: PoolFormErrors,
  input: number | string
): boolean => {
  switch (error) {
    case PoolFormErrors.NAME:
      return (input as string) !== "";
    case PoolFormErrors.AMOUNT:
      return (input as number) >= 0;
    case PoolFormErrors.PERIOD:
      return periods.includes(input as string);
    case PoolFormErrors.START_DATE:
      console.log(input);
      return (input as string) !== "";
    case PoolFormErrors.START_AMOUNT:
      return (input as number) >= 0;
    default:
      // TODO: Add logging here to track when this happens
      return false;
  }
};

export const poolFormIsValid = (pool: PoolFormDataDto): boolean =>
  fieldIsValid(PoolFormErrors.NAME, pool.name) &&
  fieldIsValid(PoolFormErrors.AMOUNT, pool.amount) &&
  fieldIsValid(PoolFormErrors.PERIOD, pool.period) &&
  fieldIsValid(PoolFormErrors.START_DATE, pool.startDate) &&
  fieldIsValid(PoolFormErrors.START_AMOUNT, pool.startAmount);
