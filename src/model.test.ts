import { describe, expect, it } from "vitest";
import {
  allocateIds,
  balanceHistory,
  capRangesOverlap,
  emptyStore,
  formatHours,
  isValidDate,
  nthWeekdayInMonth,
  normalizeStore,
  parseStoreJson,
  parseHours,
  poolAccruedOn,
  poolBalanceOn,
  poolTotalsOn,
  recurringOccurrencesThrough,
  serializeStoreJson,
  totalsOn,
  validDateOrFallback,
  type LeaveEvent,
  type Pool,
  type RecurringAddition,
} from "./model";

function recurring(
  cadence: RecurringAddition["cadence"],
  start_date: string,
  amount = 1,
  end_date?: string,
): RecurringAddition {
  return { id: 1, amount, cadence, start_date, ...(end_date ? { end_date } : {}) };
}

describe("hour amounts", () => {
  it("accepts up to two decimal places and optionally zero", () => {
    expect(parseHours("7.65")).toBe(7.65);
    expect(parseHours("0.00", true)).toBe(0);
    expect(parseHours("7.654")).toBeNull();
    expect(parseHours("0")).toBeNull();
    expect(parseHours("-1.25", true)).toBeNull();
    expect(formatHours(3.5)).toBe("3.5");
    expect(formatHours(-0.004)).toBe("0");
  });
});

describe("calendar date validation", () => {
  it("accepts real ISO dates and rejects malformed or impossible dates", () => {
    expect(isValidDate("2024-02-29")).toBe(true);
    expect(isValidDate("2025-02-29")).toBe(false);
    expect(isValidDate("2025-13-01")).toBe(false);
    expect(isValidDate("2025-2-01")).toBe(false);
  });

  it("keeps the last valid date when a new selection is invalid", () => {
    expect(validDateOrFallback("2025-02-30", "2025-02-28")).toBe("2025-02-28");
    expect(validDateOrFallback("2025-03-01", "2025-02-28")).toBe("2025-03-01");
  });
});

describe("recurring accruals", () => {
  it("includes the start date and only completed occurrences", () => {
    const rule = recurring("Fortnightly", "2026-01-02", 3.8);
    expect(recurringOccurrencesThrough(rule, "2026-01-01")).toBe(0);
    expect(recurringOccurrencesThrough(rule, "2026-01-02")).toBe(1);
    expect(recurringOccurrencesThrough(rule, "2026-01-30")).toBe(3);
  });

  it("clamps monthly dates while keeping the original day for later months", () => {
    const rule = recurring("Monthly", "2025-01-31");
    expect(recurringOccurrencesThrough(rule, "2025-02-28")).toBe(2);
    expect(recurringOccurrencesThrough(rule, "2025-03-30")).toBe(2);
    expect(recurringOccurrencesThrough(rule, "2025-03-31")).toBe(3);
  });

  it("handles yearly leap-day recurrence with calendar-month clamping", () => {
    const rule = recurring("Yearly", "2024-02-29");
    expect(recurringOccurrencesThrough(rule, "2025-02-28")).toBe(2);
    expect(recurringOccurrencesThrough(rule, "2025-02-27")).toBe(1);
  });

  it("calculates yearly nth-weekday accrual dates", () => {
    expect(nthWeekdayInMonth(2026, 8, "First", "Friday")).toBe("2026-08-07");
    expect(nthWeekdayInMonth(2027, 8, "First", "Friday")).toBe("2027-08-06");
    expect(nthWeekdayInMonth(2026, 8, "Fifth", "Friday")).toBeNull();
    expect(nthWeekdayInMonth(2026, 2, "Last", "Monday")).toBe("2026-02-23");

    const rule: RecurringAddition = {
      id: 1,
      amount: 8,
      cadence: "YearlyNthWeekday",
      start_date: "2026-01-01",
      month: 8,
      nth_weekday: "First",
      weekday: "Friday",
    };
    expect(recurringOccurrencesThrough(rule, "2026-08-06")).toBe(0);
    expect(recurringOccurrencesThrough(rule, "2026-08-07")).toBe(1);
    expect(recurringOccurrencesThrough(rule, "2027-08-06")).toBe(2);
  });

  it("starts nth-weekday schedules at the next matching date and honors their end date", () => {
    const rule: RecurringAddition = {
      id: 1,
      amount: 8,
      cadence: "YearlyNthWeekday",
      start_date: "2026-08-08",
      end_date: "2027-08-06",
      month: 8,
      nth_weekday: "First",
      weekday: "Friday",
    };
    expect(recurringOccurrencesThrough(rule, "2026-08-07")).toBe(0);
    expect(recurringOccurrencesThrough(rule, "2027-08-05")).toBe(0);
    expect(recurringOccurrencesThrough(rule, "2027-08-06")).toBe(1);
    expect(recurringOccurrencesThrough(rule, "2028-08-04")).toBe(1);
  });

  it("includes accruals through the optional end date, then stops", () => {
    const rule = recurring("Weekly", "2026-01-02", 3.5, "2026-01-16");
    expect(recurringOccurrencesThrough(rule, "2026-01-01")).toBe(0);
    expect(recurringOccurrencesThrough(rule, "2026-01-15")).toBe(2);
    expect(recurringOccurrencesThrough(rule, "2026-01-16")).toBe(3);
    expect(recurringOccurrencesThrough(rule, "2026-02-01")).toBe(3);
    expect(poolAccruedOn({ id: 1, name: "Leave", additions: [], recurring: [rule], caps: [] }, "2026-02-01")).toBe(10.5);
  });

  it("does not accrue when the end date is before the start date", () => {
    const rule = recurring("Monthly", "2026-01-02", 1, "2026-01-01");
    expect(recurringOccurrencesThrough(rule, "2026-02-01")).toBe(0);
  });

  it("limits accruals to the active pool cap, discards excess, and resumes when room opens", () => {
    const pool: Pool = {
      id: 1,
      name: "Leave",
      additions: [{ id: 2, amount: 8, date: "2026-01-01" }],
      recurring: [{ ...recurring("Weekly", "2026-01-02", 5), id: 5 }],
      caps: [{ id: 3, max_balance: 10, start_date: "2026-01-02", end_date: "2026-01-30" }],
    };
    const events: LeaveEvent[] = [{
      id: 4,
      name: "Time off",
      days: [
        { date: "2026-01-10", allocations: [{ pool_id: 1, hours: 4 }] },
        { date: "2026-01-28", allocations: [{ pool_id: 1, hours: 4 }] },
        { date: "2026-02-07", allocations: [{ pool_id: 1, hours: 2 }] },
      ],
    }];
    const store = normalizeStore({ pools: [pool], events });

    expect(poolAccruedOn(pool, "2026-02-06", events)).toBe(23);
    expect(poolBalanceOn(store, 1, "2026-02-06")).toBe(15);
    expect(poolTotalsOn(store, 1, "2026-02-06")).toEqual({ accrued: 23, used: 8, balance: 15 });
    expect(totalsOn(store, "2026-02-06")).toEqual({ accrued: 23, used: 8, balance: 15 });
  });

  it("keeps an existing over-cap balance and resumes accrual after usage frees room", () => {
    const pool: Pool = {
      id: 1,
      name: "Leave",
      additions: [{ id: 2, amount: 8, date: "2026-01-01" }],
      recurring: [{ ...recurring("Weekly", "2026-01-02", 2), id: 4 }],
      caps: [{ id: 3, max_balance: 5, start_date: "2026-01-02", end_date: "2026-01-16" }],
    };
    const events: LeaveEvent[] = [{
      id: 5,
      name: "Time off",
      days: [{ date: "2026-01-09", allocations: [{ pool_id: 1, hours: 4 }] }],
    }];

    expect(poolAccruedOn(pool, "2026-01-02", events)).toBe(8);
    expect(poolBalanceOn(normalizeStore({ pools: [pool], events }), 1, "2026-01-16")).toBe(5);
  });

  it("treats cap date ranges as inclusive when checking overlap", () => {
    expect(capRangesOverlap([
      { start_date: "2026-01-01", end_date: "2026-01-31" },
      { start_date: "2026-01-31", end_date: "2026-02-28" },
    ])).toBe(true);
    expect(capRangesOverlap([
      { start_date: "2026-01-01", end_date: "2026-01-31" },
      { start_date: "2026-02-01", end_date: "2026-02-28" },
    ])).toBe(false);
  });

  it("normalizes caps without overlapping dates and includes cap ids in allocation", () => {
    const store = normalizeStore({
      pools: [{
        id: 1,
        name: "Leave",
        additions: [],
        recurring: [],
        caps: [
          { id: 2, max_balance: 40, start_date: "2026-01-01", end_date: "2026-01-31" },
          { id: 3, max_balance: 60, start_date: "2026-01-31", end_date: "2026-02-28" },
        ],
      }],
    });
    expect(store.pools[0]?.caps).toHaveLength(1);
    expect(store.next_id).toBe(3);
    expect(allocateIds(store).firstId).toBe(3);
  });
});

describe("balances", () => {
  it("combines accruals with per-day, multi-pool event allocations", () => {
    const store = normalizeStore({
      pools: [
        { id: 1, name: "Personal leave", additions: [{ id: 2, amount: 8, date: "2026-01-01" }], recurring: [] },
        { id: 3, name: "Carer's leave", additions: [{ id: 4, amount: 6, date: "2026-01-01" }], recurring: [] },
      ],
      events: [
        {
          id: 5,
          name: "Family trip",
          days: [
            { date: "2026-02-01", allocations: [{ pool_id: 1, hours: 1.25 }, { pool_id: 3, hours: 0.75 }] },
            { date: "2026-02-02", allocations: [{ pool_id: 3, hours: 3 }] },
          ],
        },
      ],
    });

    expect(totalsOn(store, "2026-02-01")).toEqual({ accrued: 14, used: 2, balance: 12 });
    expect(poolBalanceOn(store, 1, "2026-02-01")).toBe(6.75);
    expect(poolBalanceOn(store, 3, "2026-02-02")).toBe(2.25);
    expect(totalsOn(store, "2026-02-02").balance).toBe(9);
  });
});

describe("saved data compatibility", () => {
  it("keeps legacy recurring rules open-ended and restores valid end dates", () => {
    const store = normalizeStore({
      pools: [{
        id: 1,
        name: "Annual leave",
        additions: [],
        recurring: [
          { id: 2, amount: 2, cadence: "Monthly", start_date: "2026-01-01" },
          { id: 3, amount: 2, cadence: "Monthly", start_date: "2026-01-01", end_date: "2026-02-01" },
          { id: 4, amount: 2, cadence: "Monthly", start_date: "2026-01-01", end_date: "2026-02-30" },
        ],
      }],
    });

    expect(store.pools[0]?.recurring).toHaveLength(2);
    expect(store.pools[0]?.recurring[0]?.end_date).toBeUndefined();
    expect(store.pools[0]?.recurring[1]?.end_date).toBe("2026-02-01");
  });

  it("preserves valid yearly nth-weekday schedule details", () => {
    const store = normalizeStore({
      pools: [{
        id: 1,
        name: "Leave",
        additions: [],
        recurring: [{
          id: 2,
          amount: 8,
          cadence: "YearlyNthWeekday",
          start_date: "2026-01-01",
          month: 8,
          nth_weekday: "First",
          weekday: "Friday",
        }],
      }],
    });
    expect(store.pools[0]?.recurring[0]).toMatchObject({
      cadence: "YearlyNthWeekday",
      month: 8,
      nth_weekday: "First",
      weekday: "Friday",
    });
  });

  it("migrates the previous single-day event format", () => {
    const store = normalizeStore({
      pools: [{ id: 1, name: "Personal leave", additions: [], recurring: [] }],
      events: [{ id: 2, name: "Appointment", pool_id: 1, date: "2026-04-15", amount: 1.5 }],
    });
    expect(store.events[0]?.days).toEqual([
      { date: "2026-04-15", allocations: [{ pool_id: 1, hours: 1.5 }] },
    ]);
    expect(allocateIds(store).firstId).toBe(3);
  });

  it("migrates old per-day pool assignments and preserves the next id", () => {
    const store = normalizeStore({
      next_id: 20,
      events: [{
        id: 8,
        name: "Conference",
        pool_id: 4,
        days: [{ date: "2026-05-10", hours: 4, pool_id: 2 }, { date: "2026-05-11", hours: 6 }],
      }],
    });
    expect(store.events[0]?.days.map((day) => day.allocations[0]?.pool_id)).toEqual([2, 4]);
    expect(store.next_id).toBe(20);
  });
});

describe("JSON data backups", () => {
  it("round-trips pools, schedules, caps, and leave events", () => {
    const store = normalizeStore({
      next_id: 9,
      pools: [{
        id: 1,
        name: "Personal leave",
        additions: [{ id: 2, amount: 8, date: "2026-01-01" }],
        recurring: [{
          id: 3,
          amount: 2,
          cadence: "YearlyNthWeekday",
          start_date: "2026-02-01",
          month: 8,
          nth_weekday: "First",
          weekday: "Friday",
        }],
        caps: [{ id: 4, max_balance: 80, start_date: "2026-01-01", end_date: "2026-12-31" }],
      }],
      events: [{
        id: 5,
        name: "Long weekend",
        days: [{ date: "2026-04-15", allocations: [{ pool_id: 1, hours: 3.5 }] }],
      }],
    });

    expect(parseStoreJson(serializeStoreJson(store))).toEqual(store);
  });

  it("rejects malformed JSON and files without pool and event data", () => {
    expect(() => parseStoreJson("{")).toThrow("not valid JSON");
    expect(() => parseStoreJson(JSON.stringify({ preferences: {} }))).toThrow("hima data export");
  });
});

describe("balance chart", () => {
  it("contains a year of actual history and a year of projected balances", () => {
    const history = balanceHistory(emptyStore(), "2026-10-06");
    expect(history).toHaveLength(731);
    expect(history[0]?.date).toBe("2025-10-06");
    expect([...history].reverse().find((point) => !point.projected)?.date).toBe("2026-10-06");
    expect(history.at(-1)?.date).toBe("2027-10-06");
    expect(history[0]?.projected).toBe(false);
    expect(history.find((point) => point.date === "2026-10-06")?.projected).toBe(false);
    expect(history.at(-1)?.projected).toBe(true);
  });
});
