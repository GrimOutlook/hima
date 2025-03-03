import dayjs, { Dayjs } from "dayjs";
import Period from "./lib/models/Period";
import PPLEvent from "./lib/models/PPLEvent";
import { PPLPool } from "./lib/models/PPLPool";

export function calculateAmount(targetDate: Dayjs, pool: PPLPool, events: PPLEvent[]) {
    let gross_accrued_hours = elapsedPeriods(pool.startDate, targetDate, pool.period) * pool.amount
    let event_hours = events
        .filter((ev) => targetDate.diff(ev.date).valueOf() >= 0)
        .map((ev => ev.hours))

    // This has to be included because if the event list is empty then reduce cannot be run. Reduce
    // requires at least 1 value in the array or it throws a TypeError.
    if (event_hours.length > 0) {
        console.log("Event hours present. Calculating...")
        return gross_accrued_hours - event_hours.reduce((acc, current) => acc + current)
    }

    console.log(`No event hours. Returning gross [${gross_accrued_hours}]`)
    return gross_accrued_hours
}

function elapsedPeriods(targetDate: Dayjs, startDate: Dayjs, period: Period) {
    switch(period) {
        case Period.Daily:
            return targetDate.diff(startDate, 'day')
        case Period.Weekly:
            return Math.trunc(targetDate.diff(startDate, 'day') / 7)
        case Period.BiWeekly:
            return Math.trunc(targetDate.diff(startDate, 'day') / 14)
        case Period.Monthly:
            return targetDate.diff(startDate, 'month')
        case Period.Yearly:
            // Could just divide elapsed days by 365 but that would stop working for leap years and
            // would also disregard leap seconds.
            return targetDate.diff(startDate, 'year')
    }
}