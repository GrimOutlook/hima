import { expect, it } from "vitest";
import { balanceHistory, emptyStore, isValidDate, MAX_HISTORY_POINTS, parseStoreJson, poolBalanceOn, type Store } from "./model";
import { validateDocument } from "./plannerPersistence";

function datedStore(date: string): Store {
  return { ...emptyStore(), next_id: 4, pools: [{ id: 1, name: "Leave", additions: [{ id: 2, amount: 10, date }], recurring: [], caps: [] }],
    events: [{ id: 3, name: "Leave", days: [{ date, allocations: [{ pool_id: 1, hours: 1 }] }] }] };
}

it.each(["0100-01-01", "1899-12-31", "2201-01-01", "9999-12-31", "1900-02-29", "2200-02-29"])("rejects unsupported date %s in validation and warns on import", (date) => {
  expect(isValidDate(date)).toBe(false);
  expect(() => validateDocument(datedStore(date))).toThrow();
  const warnings: string[] = [];
  const imported = parseStoreJson(JSON.stringify(datedStore(date)), warnings);
  expect(imported.pools[0]!.additions).toEqual([]);
  expect(imported.events).toEqual([]);
  expect(warnings.length).toBeGreaterThan(0);
});

it.each(["1900-01-01", "2200-12-31", "2000-02-29"])("accepts supported boundary/leap date %s", (date) => {
  expect(isValidDate(date)).toBe(true);
  expect(() => validateDocument(datedStore(date))).not.toThrow();
  expect(parseStoreJson(JSON.stringify(datedStore(date)))).toEqual(datedStore(date));
  const history = balanceHistory(datedStore(date), date);
  expect(history.length).toBeLessThanOrEqual(MAX_HISTORY_POINTS);
  expect(history.every((point) => isValidDate(point.date))).toBe(true);
});

it("bounds a full supported span while preserving endpoint balances and intervening actions", () => {
  const store = datedStore("1900-01-01");
  store.events[0]!.days[0]!.date = "2200-12-31";
  store.pools[0]!.recurring = [{ id: 4, amount: 1, cadence: "Yearly", start_date: "1900-01-01" }];
  const history = balanceHistory(store, "2026-01-01");
  expect(history.length).toBeLessThanOrEqual(MAX_HISTORY_POINTS);
  expect(history[0]!.date).toBe("1900-01-01");
  expect(history.at(-1)?.date).toBe("2200-12-31");
  for (const point of [history[0]!, history[Math.floor(history.length / 2)]!, history.at(-1)!]) {
    expect(point.balance).toBe(poolBalanceOn(store, 1, point.date));
  }
});

it("does not hang on the issue's already-stored extreme dates", () => {
  const store = datedStore("0100-01-01");
  store.events[0]!.days[0]!.date = "9999-12-31";
  const history = balanceHistory(store, "2026-01-01");
  expect(history.length).toBeLessThanOrEqual(MAX_HISTORY_POINTS);
  expect(history.every((point) => point.balance === 0 && isValidDate(point.date))).toBe(true);
});
