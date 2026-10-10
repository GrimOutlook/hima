// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { emptyStore, STORAGE_KEY } from "./model";
import { localPersistence, REVISION_KEY, SETTINGS_KEY } from "./localPersistence";
import { PersistenceError } from "./plannerPersistence";
import { defaultSettings } from "./settings";

const signal = new AbortController().signal;
const session = { user_id: 1, csrf_token: "local" };
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

it("loads an empty draft without writing and returns a stable session", async () => {
  expect(await localPersistence.load(signal)).toEqual({ document: null, revision: 0, updated_at: null });
  expect(localStorage.length).toBe(0);
  expect(await localPersistence.session(signal)).toEqual(await localPersistence.session(signal));
});

it("round trips the document and settings with increasing revisions", async () => {
  const document = { ...emptyStore(), settings: defaultSettings };
  expect(await localPersistence.save(document, 0, session, signal)).toMatchObject({ document, revision: 1 });
  expect(await localPersistence.load(signal)).toMatchObject({ document, revision: 1, updated_at: expect.any(String) });
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).not.toHaveProperty("settings");
  expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!)).toEqual(defaultSettings);
  await expect(localPersistence.save(document, 0, session, signal)).rejects.toMatchObject({ code: "revision_conflict", status: 409 });
});

it.each([null, "garbage", "0", "-1", "1.5"])("defaults an invalid or absent revision (%s) to one for existing data", async (revision) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyStore()));
  if (revision !== null) localStorage.setItem(REVISION_KEY, revision);
  expect(await localPersistence.load(signal)).toMatchObject({ revision: 1 });
});

it.each(["{", JSON.stringify({ version: 2 }), "null", "[]"])("rejects malformed data without repairing it: %s", async (raw) => {
  localStorage.setItem(STORAGE_KEY, raw);
  await expect(localPersistence.load(signal)).rejects.toMatchObject({ code: "invalid_document" });
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});

it("rejects malformed settings", async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyStore()));
  localStorage.setItem(SETTINGS_KEY, "{}");
  await expect(localPersistence.load(signal)).rejects.toMatchObject({ code: "invalid_document" });
});

it.each(["getItem", "setItem"] as const)("wraps %s storage failures without an auth or conflict status", async (method) => {
  vi.spyOn(Storage.prototype, method).mockImplementation(() => { throw new Error("Storage disabled"); });
  const operation = method === "getItem" ? localPersistence.load(signal) : localPersistence.save(emptyStore(), 0, session, signal);
  await expect(operation).rejects.toBeInstanceOf(PersistenceError);
  await expect(operation).rejects.toMatchObject({ code: "storage_unavailable", status: 503 });
});
