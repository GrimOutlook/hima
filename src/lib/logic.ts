import { Dayjs } from "dayjs";
import { Period } from "./models/Period";
import { PPLEvent } from "./models/PPLEvent";
import { PPLPool } from "./models/PPLPool";

export function calculateAmount(
  targetDate: Dayjs,
  pool: PPLPool,
  events: PPLEvent[],
) {
  console.debug(
    `Calculating amount from start date ${pool.startDate} to target date ${targetDate} with a period of ${pool.period} and an accrual amount of ${pool.amount}`,
  );
  const gross_accrued_hours =
    elapsedPeriods(pool.startDate, targetDate, pool.period) * pool.amount;
  const event_hours = events
    .filter((ev) => targetDate.diff(ev.date).valueOf() >= 0)
    .map((ev) => ev.hours);

  // This has to be included because if the event list is empty then reduce cannot be run. Reduce
  // requires at least 1 value in the array or it throws a TypeError.
  if (event_hours.length > 0) {
    const total_event_hours = event_hours.reduce(
      (acc, current) => acc + current,
    );
    const result = gross_accrued_hours - total_event_hours;
    console.debug(
      `Event hours present. GAH: [${gross_accrued_hours}] TEH: [${total_event_hours}]`,
    );
    return result;
  }

  console.debug(`No event hours. GAH: [${gross_accrued_hours}]`);
  return gross_accrued_hours;
}

export function elapsedPeriods(
  startDate: Dayjs,
  targetDate: Dayjs,
  period: Period,
) {
  let result;
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
      // Could just divide elapsed days by 365 but that would stop working for leap years and
      // would also disregard leap seconds.
      result = targetDate.diff(startDate, "year");
      break;
    default:
      console.error("Wtf. This shouldn't be hit.");
      result = 0;
  }
  result = Math.floor(result);
  console.debug(
    `Got elapsed periods of ${result} for: period [${period}] start [${startDate.toISOString()}] end [${targetDate.toISOString()}]`,
  );
  return result;
}
