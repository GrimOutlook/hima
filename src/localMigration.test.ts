// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import { browserLocalSource } from "./localMigration";
import { exportRawBrowserData } from "./localPersistence";
import { emptyStore, STORAGE_KEY } from "./model";

beforeEach(() => localStorage.clear());
it.each([
  { store: "broken JSON", settings: "{}", raw: '{\n  "hima.store.v1": "broken JSON",\n  "hima.settings.v1": "{}"\n}' },
  { store: null, settings: '{"ignoreWeekends":true}', raw: '{\n  "hima.store.v1": null,\n  "hima.settings.v1": "{\\"ignoreWeekends\\":true}"\n}' },
])("preserves the raw export format and legacy acknowledgement for %j", async ({ store, settings, raw }) => {
  if (store !== null) localStorage.setItem(STORAGE_KEY, store);
  localStorage.setItem("hima.settings.v1", settings);
  expect(exportRawBrowserData()).toBe(raw);
  expect((await browserLocalSource.read(1))?.raw).toBe(raw);
  localStorage.setItem("hima.migration.v1.1", raw);
  expect(await browserLocalSource.read(1)).toBeNull();
});

it("migrates unversioned legacy data and separate settings without touching originals", async () => {
  const store = JSON.stringify({ pools: [], events: [], next_id: 1 });
  localStorage.setItem(STORAGE_KEY, store);
  localStorage.setItem("hima.settings.v1", JSON.stringify({ firstDayOfWeek: "Sunday", ignoreWeekends: true, defaultTimeline: "YTD" }));
  const result = (await browserLocalSource.read(1))!;
  expect(result.document).toEqual({ ...emptyStore(), settings: { firstDayOfWeek: "Sunday", ignoreWeekends: true, defaultTimeline: "YTD" } });
  browserLocalSource.confirm(1, result.fingerprint);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(store);
  expect(await browserLocalSource.read(1)).toBeNull();
  expect((await browserLocalSource.read(2))?.document).toEqual(result.document);
  expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(localStorage.getItem("hima.migration.v1.1")).toBe(result.fingerprint);
});
it("retains malformed and unsupported local data for raw export", async () => {
  localStorage.setItem(STORAGE_KEY, '{"version":999}');
  expect(await browserLocalSource.read(1)).toMatchObject({ document: null, error: expect.any(String) });
  expect(localStorage.getItem(STORAGE_KEY)).toBe('{"version":999}');
});
it.each([
  { id: 2, name: "Trip", pool_id: 1, date: "2026-01-01", amount: 8 },
  { id: 2, name: "Trip", pool_id: 1, days: [{ date: "2026-01-01", hours: 8 }] },
])("migrates supported older event formats (%j)", async (event) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ pools: [{ id: 1, name: "Leave" }], events: [event], next_id: 3 }));
  expect((await browserLocalSource.read(1))?.document?.events[0]?.days).toEqual([{ date: "2026-01-01", allocations: [{ pool_id: 1, hours: 8 }] }]);
});
it("migrates settings-only storage and offers changed originals again", async () => {
  localStorage.setItem("hima.settings.v1", '{"ignoreWeekends":true}');
  const result = (await browserLocalSource.read(1))!;
  expect(result.document?.settings?.ignoreWeekends).toBe(true);
  browserLocalSource.confirm(1, result.fingerprint);
  localStorage.setItem("hima.settings.v1", '{"ignoreWeekends":false}');
  expect(await browserLocalSource.read(1)).not.toBeNull();
});
it("upgrades legacy raw acknowledgements for every account", async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyStore()));
  const result = (await browserLocalSource.read(1))!;
  localStorage.setItem("hima.migration.v1.1", result.raw);
  localStorage.setItem("hima.migration.v1.2", result.raw);
  expect(await browserLocalSource.read(1)).toBeNull();
  expect(localStorage.getItem("hima.migration.v1.2")).toBe(result.fingerprint);
});
it("removes sources, numbered recovery backups and acknowledgements without touching unrelated keys", async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyStore()));
  const result = (await browserLocalSource.read(1))!;
  for (const key of ["hima.store.v1.backup", "hima.store.v1.backup.2", "hima.settings.v1.backup", "hima.migration.v1.2"]) localStorage.setItem(key, "private");
  localStorage.setItem("unrelated", "keep");
  browserLocalSource.remove!(result.raw);
  expect(Object.keys(localStorage)).toEqual(["unrelated"]);
  expect(await browserLocalSource.read(2)).toBeNull();
});
it("keeps newer browser data if it changes before removal", async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyStore()));
  const result = (await browserLocalSource.read(1))!;
  localStorage.setItem("hima.settings.v1", "{}");
  expect(() => browserLocalSource.remove!(result.raw)).toThrow("Browser data changed");
  expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
});
it("replaces orphaned raw acknowledgements with a known SHA-256 digest", async () => {
  localStorage.setItem("hima.migration.v1.1", "abc");
  expect(await browserLocalSource.read(2)).toBeNull();
  expect(localStorage.getItem("hima.migration.v1.1")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
