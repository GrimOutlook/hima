import { expect, it } from "vitest";
import { validateDocument } from "./plannerPersistence";
import { parseStoreJson, parseHours } from "./model";
import { parseBackupJson } from "./backup";
import { defaultSettings } from "./settings";

const document = () => ({ version: 1, next_id: 100_000,
  pools: [{ id: 1, name: "Leave", additions: [{ id: 2, amount: 1, date: "2026-01-01" }], recurring: [{ id: 3, amount: 1, cadence: "Weekly", start_date: "2026-01-01" }], caps: [{ id: 4, max_balance: 1, start_date: "2026-01-01" }] }],
  events: [{ id: 5, name: "Trip", days: [{ date: "2026-01-01", allocations: [{ pool_id: 1, hours: 1 }] }] }],
});

it("keeps cent precision strict for edits and remote data while repairing legacy imports", () => {
  for (const amount of [0.1 + 0.2, 1.23, 1.234, Infinity, NaN, Number.MAX_VALUE]) {
    const v = document();
    v.pools[0]!.additions[0]!.amount = amount;
    if (amount === 0.1 + 0.2 || amount === 1.23) {
      expect(parseHours(String(amount))).toBeCloseTo(amount);
      expect(() => validateDocument(v)).not.toThrow();
    } else {
      expect(parseHours(String(amount))).toBeNull();
      expect(() => validateDocument(v)).toThrow();
    }
  }
  const v = document();
  v.pools[0]!.additions[0]!.amount = 1.234;
  expect(parseStoreJson(JSON.stringify(v)).pools[0]!.additions[0]!.amount).toBe(1.23);
});

it("retains strict remote settings keys while backups strip unknown settings", () => {
  const v = { ...document(), settings: { ...defaultSettings, futureOption: true } };
  expect(() => validateDocument(v)).toThrow();
  expect(parseBackupJson(JSON.stringify(v)).settings).toEqual(defaultSettings);
  expect(v.settings.futureOption).toBe(true);
});

it("enforces name limits in UTF-16 code units and all hour limits", () => {
  for (const [collection, limit] of [["pools", 48], ["events", 64]] as const) {
    for (const unit of ["a", "é", "😀"]) {
      const v = document();
      v[collection][0]!.name = unit.repeat(limit / unit.length);
      expect(() => validateDocument(v)).not.toThrow();
      v[collection][0]!.name += "a";
      expect(() => validateDocument(v)).toThrow();
    }
  }
  for (const hours of [999_999.99, 1_000_000, 1_000_000.01, 1e300]) {
    for (const field of ["addition", "recurring", "cap", "allocation"]) {
      const v = document();
      if (field === "addition") v.pools[0]!.additions[0]!.amount = hours;
      if (field === "recurring") v.pools[0]!.recurring[0]!.amount = hours;
      if (field === "cap") v.pools[0]!.caps[0]!.max_balance = hours;
      if (field === "allocation") v.events[0]!.days[0]!.allocations[0]!.hours = hours;
      if (hours <= 1_000_000) expect(() => validateDocument(v)).not.toThrow();
      else expect(() => validateDocument(v)).toThrow();
    }
  }
});

it("rejects duplicate dates and pools without mutation, allowing dates across events", () => {
  for (const duplicateDay of [true, false]) {
    const v = document();
    if (duplicateDay) v.events[0]!.days.push(structuredClone(v.events[0]!.days[0]!));
    else v.events[0]!.days[0]!.allocations.push({ pool_id: 1, hours: 2 });
    const before = structuredClone(v);
    expect(() => validateDocument(v)).toThrow();
    expect(v).toEqual(before);
  }
  const v = document();
  v.events.push({ ...structuredClone(v.events[0]!), id: 6 });
  expect(() => validateDocument(v)).not.toThrow();
});

it.each([ ["pools", 100], ["events", 10_000], ["additions", 10_000], ["recurring", 1000], ["caps", 1000], ["days", 3660], ["allocations", 100] ] as const)("bounds %s inclusively", (key, limit) => {
  const v = document();
  const date = (i: number) => new Date(Date.UTC(2000, 0, i + 1)).toISOString().slice(0, 10);
  if (key === "pools") {
    v.pools = Array.from({ length: limit }, (_, i) => ({ ...structuredClone(v.pools[0]!), id: i + 1 }));
  } else if (key === "events") {
    v.events = Array.from({ length: limit }, (_, i) => ({ ...structuredClone(v.events[0]!), id: i + 1 }));
  } else if (key === "days") {
    v.events[0]!.days = Array.from({ length: limit }, (_, i) => ({ ...structuredClone(v.events[0]!.days[0]!), date: date(i) }));
  } else if (key === "allocations") {
    v.pools = Array.from({ length: limit }, (_, i) => ({ ...structuredClone(v.pools[0]!), id: i + 1 }));
    v.events[0]!.days[0]!.allocations = Array.from({ length: limit }, (_, i) => ({ pool_id: i + 1, hours: 1 }));
  } else if (key === "caps") {
    v.pools[0]!.caps = Array.from({ length: limit }, (_, i) => ({ id: i + 1, max_balance: 1, start_date: date(i), end_date: date(i) }));
  } else if (key === "additions") {
    v.pools[0]!.additions = Array.from({ length: limit }, (_, i) => ({ id: i + 1, amount: 1, date: date(i) }));
  } else {
    v.pools[0]!.recurring = Array.from({ length: limit }, (_, i) => ({ ...v.pools[0]!.recurring[0]!, id: i + 1 }));
  }
  expect(() => validateDocument(v)).not.toThrow();
  const entries = key === "pools" || key === "events" ? v[key] : key === "days" ? v.events[0]!.days : key === "allocations" ? v.events[0]!.days[0]!.allocations : v.pools[0]![key];
  // An extra otherwise-valid entry must be rejected regardless of its contents.
  const extra = { ...structuredClone(entries[0]) } as Record<string, unknown>;
  if (key === "days") extra.date = date(limit);
  else if (key === "allocations") extra.pool_id = 101;
  else extra.id = 50_000;
  if (key === "caps") { extra.start_date = date(limit); extra.end_date = date(limit); }
  entries.push(extra as never);
  expect(() => validateDocument(v)).toThrow();
});
