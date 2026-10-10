// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { parseBackupJson, serializeBackupJson } from "./backup";
import { emptyStore, normalizeStore, parseStoreJson, STORAGE_KEY, STORE_VERSION } from "./model";
import { localPersistence } from "./localPersistence";

describe("planner schema versions", () => {
  beforeEach(() => window.localStorage.clear());
  const signal = new AbortController().signal;
  const session = { user_id: 1, csrf_token: "local" };

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

  it("migrates unversioned event formats and writes the current version everywhere", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    const store = parseStoreJson(JSON.stringify(legacy));
    expect(store.version).toBe(STORE_VERSION);
    expect(store.events.map((event) => event.days[0]?.allocations))
      .toEqual([8, 4, 2, 1].map((hours) => [{ pool_id: 1, hours }]));
    await localPersistence.save(store, 1, session, signal);
    expect((await localPersistence.load(signal)).document).toEqual(store);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual(store);
    expect(parseStoreJson(JSON.stringify(store))).toEqual(store);
    const settings = { firstDayOfWeek: "Monday", ignoreWeekends: false, defaultTimeline: "future 1 year" } as const;
    const backup = serializeBackupJson(store, settings);
    expect(JSON.parse(backup).version).toBe(STORE_VERSION);
    expect(parseBackupJson(backup)).toEqual({ store, settings });
    expect(emptyStore().version).toBe(STORE_VERSION);
  });

  it("does not apply legacy event migrations to versioned data", () => {
    const warnings: string[] = [];
    const store = normalizeStore({ ...legacy, version: STORE_VERSION }, warnings);
    expect(store.events.map((event) => event.id)).toEqual([5]);
    expect(warnings).toContain("Ignored 3 events (invalid or duplicate).");
  });

  it.each([0, 2, -1, 1.5, "1", null, true])("rejects unsupported or malformed version %j", async (version) => {
    const json = JSON.stringify({ ...legacy, version });
    expect(() => parseStoreJson(json)).toThrow("Unsupported data schema version");
    expect(() => parseBackupJson(json)).toThrow("Unsupported data schema version");
    window.localStorage.setItem(STORAGE_KEY, json);
    await expect(localPersistence.load(signal)).rejects.toMatchObject({ code: "invalid_document" });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(json);
  });
});
