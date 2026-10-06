import { describe, expect, it } from "vitest";
import {
  allocateIds,
  balanceHistory,
  emptyStore,
  formatHours,
  isValidDate,
  normalizeStore,
  parseHours,
  poolAccruedOn,
  poolBalanceOn,
  recurringOccurrencesThrough,
  totalsOn,
  validDateOrFallback,
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

  it("includes accruals through the optional end date, then stops", () => {
    const rule = recurring("Weekly", "2026-01-02", 3.5, "2026-01-16");
    expect(recurringOccurrencesThrough(rule, "2026-01-01")).toBe(0);
    expect(recurringOccurrencesThrough(rule, "2026-01-15")).toBe(2);
    expect(recurringOccurrencesThrough(rule, "2026-01-16")).toBe(3);
    expect(recurringOccurrencesThrough(rule, "2026-02-01")).toBe(3);
    expect(poolAccruedOn({ id: 1, name: "Leave", additions: [], recurring: [rule] }, "2026-02-01")).toBe(10.5);
  });

  it("does not accrue when the end date is before the start date", () => {
    const rule = recurring("Monthly", "2026-01-02", 1, "2026-01-01");
    expect(recurringOccurrencesThrough(rule, "2026-02-01")).toBe(0);
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
