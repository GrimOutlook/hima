// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import { browserLocalSource } from "./localMigration";
import { emptyStore, STORAGE_KEY } from "./model";

beforeEach(() => localStorage.clear());
it("migrates unversioned legacy data and separate settings without touching originals", () => {
  const store = JSON.stringify({ pools: [], events: [], next_id: 1 });
  localStorage.setItem(STORAGE_KEY, store);
  localStorage.setItem("hima.settings.v1", JSON.stringify({ firstDayOfWeek: "Sunday", ignoreWeekends: true, defaultTimeline: "YTD" }));
  const result = browserLocalSource.read(1)!;
  expect(result.document).toEqual({ ...emptyStore(), settings: { firstDayOfWeek: "Sunday", ignoreWeekends: true, defaultTimeline: "YTD" } });
  browserLocalSource.confirm(1, result.fingerprint);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(store);
  expect(browserLocalSource.read(1)).toBeNull();
  expect(browserLocalSource.read(2)?.document).toEqual(result.document);
});
it("retains malformed and unsupported local data for raw export", () => {
  localStorage.setItem(STORAGE_KEY, '{"version":999}');
  expect(browserLocalSource.read(1)).toMatchObject({ document: null, error: expect.any(String) });
  expect(localStorage.getItem(STORAGE_KEY)).toBe('{"version":999}');
});
it.each([
  { id: 2, name: "Trip", pool_id: 1, date: "2026-01-01", amount: 8 },
  { id: 2, name: "Trip", pool_id: 1, days: [{ date: "2026-01-01", hours: 8 }] },
])("migrates supported older event formats (%j)", (event) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ pools: [{ id: 1, name: "Leave" }], events: [event], next_id: 3 }));
  expect(browserLocalSource.read(1)?.document?.events[0]?.days).toEqual([{ date: "2026-01-01", allocations: [{ pool_id: 1, hours: 8 }] }]);
});
it("migrates settings-only storage and offers changed originals again", () => {
  localStorage.setItem("hima.settings.v1", '{"ignoreWeekends":true}');
  const result = browserLocalSource.read(1)!;
  expect(result.document?.settings?.ignoreWeekends).toBe(true);
  browserLocalSource.confirm(1, result.fingerprint);
  localStorage.setItem("hima.settings.v1", '{"ignoreWeekends":false}');
  expect(browserLocalSource.read(1)).not.toBeNull();
});
