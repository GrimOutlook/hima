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

  it("keeps open-ended caps active and resumes accrual after usage", () => {
    const store = normalizeStore({
      pools: [{
        id: 1,
        name: "Leave",
        additions: [{ id: 2, amount: 8, date: "2026-01-01" }],
        recurring: [{ ...recurring("Weekly", "2026-01-02", 5), id: 3 }],
        caps: [{ id: 4, max_balance: 10, start_date: "2026-01-02" }],
      }],
      events: [{
        id: 5,
        name: "Time off",
        days: [{ date: "2027-01-01", allocations: [{ pool_id: 1, hours: 4 }] }],
      }],
    });
    expect(store.pools[0]?.caps[0]?.end_date).toBeUndefined();
    expect(poolBalanceOn(store, 1, "2026-12-31")).toBe(10);
    expect(poolBalanceOn(store, 1, "2027-01-01")).toBe(6);
    expect(poolTotalsOn(store, 1, "2027-01-08")).toEqual({ accrued: 14, used: 4, balance: 10 });
  });

  it("rejects caps overlapping an ongoing cap and normalizes blank end dates", () => {
    expect(capRangesOverlap([
      { start_date: "2027-01-01", end_date: "2027-12-31" },
      { start_date: "2026-02-01" },
    ])).toBe(true);
    expect(capRangesOverlap([
      { start_date: "2026-01-01", end_date: "2026-01-31" },
      { start_date: "2026-02-01" },
    ])).toBe(false);
    const store = normalizeStore({ pools: [{
      id: 1, name: "Leave", additions: [], recurring: [],
      caps: [
        { id: 3, max_balance: 20, start_date: "2027-01-01" },
        { id: 2, max_balance: 10, start_date: "2026-02-01", end_date: "" },
      ],
    }] });
    expect(store.pools[0]?.caps).toEqual([
      { id: 2, max_balance: 10, start_date: "2026-02-01" },
    ]);
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

describe("use-by dates", () => {
  it("sets one-time and repeating reset balances without counting them as accrual", () => {
    const store = normalizeStore({ pools: [{
      id: 1, name: "Leave",
      additions: [
        { id: 2, amount: 20, date: "2026-01-01" },
        { id: 3, reset: true, amount: 7.5, date: "2026-01-02" },
        { id: 4, amount: 2, date: "2026-01-03" },
      ],
      recurring: [{ id: 5, reset: true, amount: 12.25, cadence: "Monthly", start_date: "2026-01-04" }],
      caps: [{ id: 6, max_balance: 10, start_date: "2026-01-01" }],
    }] });
    expect(poolBalanceOn(store, 1, "2026-01-02")).toBe(7.5);
    expect(poolBalanceOn(store, 1, "2026-01-03")).toBe(9.5);
    expect(poolTotalsOn(store, 1, "2026-01-04")).toEqual({ accrued: 12, used: 0, balance: 12.25 });
    expect(poolBalanceOn(store, 1, "2026-02-04")).toBe(12.25);
    expect(parseStoreJson(serializeStoreJson(store))).toEqual(store);
  });

  it("expires the remaining balance after same-day credits and usage, preserving lifetime totals", () => {
    const store = normalizeStore({ pools: [{
      id: 1, name: "Leave", recurring: [],
      additions: [
        { id: 2, amount: 20, date: "2026-01-01" },
        { id: 3, amount: 5, date: "2026-01-31" },
        { id: 4, reset: true, date: "2026-01-31" },
        { id: 5, amount: 8, date: "2026-02-01" },
      ],
    }], events: [{ id: 6, name: "Leave", days: [
      { date: "2026-01-15", allocations: [{ pool_id: 1, hours: 4 }] },
      { date: "2026-01-31", allocations: [{ pool_id: 1, hours: 2 }] },
    ] }] });
    expect(poolBalanceOn(store, 1, "2026-01-30")).toBe(16);
    expect(poolTotalsOn(store, 1, "2026-01-31")).toEqual({ accrued: 25, used: 6, balance: 0 });
    expect(poolTotalsOn(store, 1, "2026-02-01")).toEqual({ accrued: 33, used: 6, balance: 8 });
    expect(parseStoreJson(serializeStoreJson(store))).toEqual(store);
    expect(allocateIds(store).firstId).toBe(7);
    const history = balanceHistory(store, "2026-02-01");
    expect(history.find((point) => point.date === "2026-01-31")?.balance).toBe(0);
  });

  it.each(["Weekly", "Fortnightly", "Monthly", "Yearly"] as const)("supports %s use-by schedules and inclusive end dates", (cadence) => {
    const dates = {
      Weekly: ["2026-01-08", "2026-01-15"],
      Fortnightly: ["2026-01-15", "2026-01-29"],
      Monthly: ["2026-02-01", "2026-03-01"],
      Yearly: ["2027-01-01", "2028-01-01"],
    }[cadence];
    const store = normalizeStore({ pools: [{
      id: 1, name: "Leave",
      additions: dates.map((date, index) => ({ id: index + 2, date, amount: 10 })),
      recurring: [{ id: 4, reset: true, cadence, start_date: "2026-01-01", end_date: dates[0] }],
    }] });
    expect(poolBalanceOn(store, 1, dates[0]!)).toBe(0);
    expect(poolBalanceOn(store, 1, dates[1]!)).toBe(10);
  });

  it("supports nth-weekday resets and allows capped accrual to resume", () => {
    const store = normalizeStore({ pools: [{
      id: 1, name: "Leave",
      additions: [{ id: 2, date: "2026-01-01", amount: 20 }, { id: 3, date: "2026-01-03", amount: 20 }],
      recurring: [{ id: 4, reset: true, cadence: "YearlyNthWeekday", start_date: "2026-01-01", month: 1, nth_weekday: "First", weekday: "Friday" }],
      caps: [{ id: 5, max_balance: 10, start_date: "2026-01-01" }],
    }] });
    expect(poolBalanceOn(store, 1, "2026-01-01")).toBe(10);
    expect(poolBalanceOn(store, 1, "2026-01-02")).toBe(0);
    expect(poolBalanceOn(store, 1, "2026-01-03")).toBe(10);
    expect(poolBalanceOn(store, 1, "2027-01-01")).toBe(0);
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

  it("shows the balance history for one selected pool", () => {
    const store = normalizeStore({
      pools: [
        { id: 1, name: "Annual leave", additions: [{ id: 3, amount: 10, date: "2025-01-02" }] },
        { id: 2, name: "Personal leave", additions: [{ id: 4, amount: 20, date: "2025-01-02" }] },
      ],
      events: [{
        id: 5,
        name: "Day off",
        days: [{
          date: "2026-01-02",
          allocations: [{ pool_id: 1, hours: 2 }, { pool_id: 2, hours: 3 }],
        }],
      }],
    });
    const combined = balanceHistory(store, "2026-01-02");
    const selected = balanceHistory(store, "2026-01-02", 1);

    expect(combined.find((point) => point.date === "2026-01-02")?.balance).toBe(25);
    expect(selected.find((point) => point.date === "2026-01-02")?.balance).toBe(8);
    expect(selected.at(-1)?.balance).toBe(8);
  });

  it("persists hidden pools and excludes them only from the combined graph", () => {
    const store = normalizeStore({
      pools: [
        { id: 1, name: "Annual leave", additions: [{ id: 3, amount: 10, date: "2025-01-02" }] },
        { id: 2, name: "Personal leave", hidden_from_graph: true, additions: [{ id: 4, amount: 20, date: "2025-01-02" }] },
      ],
      events: [{ id: 5, name: "Day off", days: [{ date: "2026-01-02", allocations: [{ pool_id: 1, hours: 2 }, { pool_id: 2, hours: 3 }] }] }],
    });
    const restored = normalizeStore(JSON.parse(JSON.stringify(store)));
    expect(restored.pools[1]?.hidden_from_graph).toBe(true);
    expect(balanceHistory(restored, "2026-01-02").at(-1)?.balance).toBe(8);
    expect(balanceHistory(restored, "2026-01-02", 2).at(-1)?.balance).toBe(17);
    expect(totalsOn(restored, "2026-01-02").balance).toBe(25);
    restored.pools[1].hidden_from_total = true;
    const hiddenTotalStore = normalizeStore(JSON.parse(JSON.stringify(restored)));
    expect(hiddenTotalStore.pools[1].hidden_from_total).toBe(true);
    expect(totalsOn(hiddenTotalStore, "2026-01-02")).toEqual({ accrued: 30, used: 5, balance: 8 });
    expect(balanceHistory(hiddenTotalStore, "2026-01-02", 2).at(-1)?.balance).toBe(17);
    hiddenTotalStore.pools[0].hidden_from_total = true;
    expect(totalsOn(hiddenTotalStore, "2026-01-02").balance).toBe(0);

    restored.pools[0].hidden_from_graph = true;
    const emptyHistory = balanceHistory(restored, "2026-01-02");
    expect(emptyHistory.length).toBeGreaterThan(0);
    expect(emptyHistory.every((point) => point.balance === 0)).toBe(true);
  });

  it("keeps all available history for the timeline's all-time preset", () => {
    const store = normalizeStore({
      pools: [
        { id: 1, name: "Annual leave", additions: [{ id: 3, amount: 10, date: "2019-04-10" }] },
        { id: 2, name: "Personal leave", additions: [{ id: 4, amount: 20, date: "2012-06-01" }] },
      ],
      events: [],
    });

    expect(balanceHistory(store, "2026-10-06")[0]?.date).toBe("2012-06-01");
    expect(balanceHistory(store, "2026-10-06", 1)[0]?.date).toBe("2019-04-10");
  });
});
