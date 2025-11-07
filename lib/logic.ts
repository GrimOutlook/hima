import { Dayjs } from "dayjs";
import { PPLEvent } from "./models/PPLEvent";
import { PPLPool } from "./models/PPLPool";
import { Period } from "./models/Period";
import { isEmpty } from "./helpers";

export const elapsedPeriods = (
  startDate: Dayjs,
  targetDate: Dayjs,
  period: Period
) => {
  let result = 0;
  switch (period) {
    case Period.Daily:
      result = targetDate.diff(startDate, "day");
      break;
    case Period.Weekly:
      result = targetDate.diff(startDate, "day") / 7;
      break;
    case Period.BiWeekly:
      result = targetDate.diff(startDate, "day") / 14;
      break;
    case Period.Monthly:
      result = targetDate.diff(startDate, "month");
      break;
    case Period.Yearly:
      /*
       * Could just divide elapsed days by 365 but that would stop working
       * leap years and would also disregard leap seconds.
       */
      result = targetDate.diff(startDate, "year");
      break;
    default:
      // TODO: Add client side logging to notify if this is hit.
      // eslint-disable-next-line no-console, no-undef
      console.error("Unreachable block calculating period has been hit");
  }
  return Math.floor(result);
};

export const calculateAmount = (
  targetDate: Dayjs,
  pool: PPLPool,
  events: PPLEvent[]
) => {
  const grossAccruedHours =
    elapsedPeriods(pool.startDate, targetDate, pool.period) * pool.amount;
  const eventHours = events
    .filter((ev) => targetDate.diff(ev.date).valueOf() >= 0)
    .map((ev) => ev.hours);

  /*
   * This has to be included because if the event list is empty then reduce
   * cannot be run. Reduce requires at least 1 value in the array or it throws
   * a TypeError.
   * */
  if (!isEmpty(eventHours)) {
    const totalEventHours = eventHours.reduce((acc, current) => acc + current);
    return grossAccruedHours - totalEventHours;
  }

  return grossAccruedHours;
};
