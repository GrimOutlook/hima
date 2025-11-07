import dayjs from "dayjs";
import { LeaveEvent } from "./models/LeaveEvent";
import { LeavePool } from "./models/LeavePool";
import { Period } from "./models/Period";
import { PoolTransaction } from "./models/PoolTransaction";
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
dayjs.extend(isSameOrBefore);

export const elapsedPeriods = (
    startDate: dayjs.Dayjs,
    targetDate: dayjs.Dayjs,
    period: Period
): number => {
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

export const amountInPool = (
    date: dayjs.Dayjs,
    pool: LeavePool,
    events: LeaveEvent[]
): number => {
    const grossAccruedHours =
        elapsedPeriods(pool.startDate, date, pool.period) * pool.amount;
    const totalEventHours = events
        .reduce((acc, event) => totalFromPool(event, pool.id, date) + acc, 0);

    return grossAccruedHours - totalEventHours;
};

export const totalFromPool = (
    event: LeaveEvent,
    poolId: number,
    date: dayjs.Dayjs
): number => {
    return event.poolTransactions
        .filter((t) => date.isSameOrBefore(t.date, 'day') && poolId == t.poolId)
        .reduce((acc: number, transaction: PoolTransaction) => acc + transaction.hours, 0)
}
