// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { parseBackupJson, serializeBackupJson } from "./backup";
import { emptyStore, loadStore, normalizeStore, parseStoreJson, saveStore, serializeStoreJson, STORAGE_KEY, STORE_VERSION } from "./model";

describe("planner schema versions", () => {
  beforeEach(() => window.localStorage.clear());

  const legacy = {
    pools: [{ id: 1, name: "Leave", additions: [], recurring: [], caps: [] }],
    events: [
      { id: 2, name: "Single day", pool_id: 1, date: "2026-01-01", amount: 8 },
      { id: 3, name: "Multiple days", pool_id: 1, days: [{ date: "2026-01-02", hours: 4 }] },
      { id: 4, name: "Day pool", days: [{ date: "2026-01-03", pool_id: 1, hours: 2 }] },
      { id: 5, name: "Current", days: [{ date: "2026-01-04", allocations: [{ pool_id: 1, hours: 1 }] }] },
    ],
    next_id: 6,
  };

  it("migrates unversioned event formats and writes the current version everywhere", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    const loaded = loadStore();
    expect(loaded.canSave).toBe(true);
    expect(loaded.warning).toBeNull();
    expect(loaded.store.version).toBe(STORE_VERSION);
    expect(loaded.store.events.map((event) => event.days[0].allocations))
      .toEqual([8, 4, 2, 1].map((hours) => [{ pool_id: 1, hours }]));
    expect(saveStore(loaded.store)).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual(loaded.store);
    expect(parseStoreJson(serializeStoreJson(loaded.store))).toEqual(loaded.store);
    const settings = { firstDayOfWeek: "Monday", ignoreWeekends: false, defaultTimeline: "future 1 year" } as const;
    const backup = serializeBackupJson(loaded.store, settings);
    expect(JSON.parse(backup).version).toBe(STORE_VERSION);
    expect(parseBackupJson(backup)).toEqual({ store: loaded.store, settings });
    expect(emptyStore().version).toBe(STORE_VERSION);
  });

  it("does not apply legacy event migrations to versioned data", () => {
    const warnings: string[] = [];
    const store = normalizeStore({ ...legacy, version: STORE_VERSION }, warnings);
    expect(store.events.map((event) => event.id)).toEqual([5]);
    expect(warnings).toContain("Ignored 3 events (invalid or duplicate).");
  });

  it.each([0, 2, -1, 1.5, "1", null, true])("rejects unsupported or malformed version %j", (version) => {
    const json = JSON.stringify({ ...legacy, version });
    expect(() => parseStoreJson(json)).toThrow("Unsupported data schema version");
    expect(() => parseBackupJson(json)).toThrow("Unsupported data schema version");
    window.localStorage.setItem(STORAGE_KEY, json);
    const loaded = loadStore();
    expect(loaded.warning).toContain("preserved");
    expect(loaded.store).toEqual(emptyStore());
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(json);
    expect(window.localStorage.getItem(`${STORAGE_KEY}.backup`)).toBe(json);
  });
});
