import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlannerController } from "./plannerController";
import { emptyStore } from "./model";
import { localPersistence } from "./localPersistence";
import { PersistenceError, type PlannerDocument, type PlannerPersistence, type StoredPlanner, type SavedPlanner } from "./plannerPersistence";
import { defaultSettings } from "./settings";
import * as persistence from "./plannerPersistence";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const a = { user_id: 1, csrf_token: "a" };
const b = { user_id: 2, csrf_token: "b" };
const doc = (name: string): PlannerDocument => ({ ...emptyStore(), pools: [{ id: 1, name, additions: [], recurring: [], caps: [] }], next_id: 2 });
const stored = (document: PlannerDocument | null, revision = document ? 1 : 0): StoredPlanner => ({ document, revision, updated_at: document ? "2026-10-09T12:00:00Z" : null });
const saved = (revision: number, document?: PlannerDocument): SavedPlanner => ({ revision, updated_at: "now", ...(document ? { document } : {}) });
let api: PlannerPersistence;
let controller: PlannerController;
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const tick = async () => { await vi.advanceTimersByTimeAsync(500); };
beforeEach(() => {
  vi.useFakeTimers();
  api = {
    session: vi.fn(async () => a), load: vi.fn(async () => stored(doc("Remote"))),
    save: vi.fn(async (document, revision, _session, _signal, options) => saved(revision + 1, options?.echoDocument ? document : undefined)), logout: vi.fn(async () => {}),
  };
  controller = new PlannerController(api);
});
afterEach(() => { controller.stop(); vi.useRealTimers(); });
async function start() { controller.start(); await settle(); }

it.each([null, doc("Remote")])("loads verified startup data in two requests (%j)", async (document) => {
  vi.mocked(api.load).mockResolvedValue({ ...stored(document), session: a });
  await start();
  expect(controller.getSnapshot()).toMatchObject({ phase: "ready", session: a });
  expect(api.session).toHaveBeenCalledTimes(1);
  expect(api.load).toHaveBeenCalledTimes(1);
  expect(api.save).not.toHaveBeenCalled();
});

it.each([b, { ...a, csrf_token: "new-login" }])("rejects a load selected by a different session (%j)", async (changed) => {
  const load = deferred<StoredPlanner>();
  vi.mocked(api.load).mockReturnValueOnce(load.promise);
  controller.start(); await settle();
  vi.mocked(api.session).mockResolvedValue(changed);
  vi.mocked(api.load).mockResolvedValue({ ...stored(doc("Current")), session: changed });
  load.resolve({ ...stored(doc("Wrong session")), session: changed });
  await settle();
  expect(controller.getSnapshot()).toMatchObject({ phase: "ready", session: changed, document: doc("Current") });
  expect(api.session).toHaveBeenCalledTimes(2);
  expect(api.load).toHaveBeenCalledTimes(2);
  controller.edit(() => doc("Edited")); await tick();
  expect(api.save).toHaveBeenCalledWith(doc("Edited"), 1, changed, expect.any(AbortSignal));
});

it("rejects an intervening account's document even when the cookie switches back before completion", async () => {
  const load = deferred<StoredPlanner>();
  vi.mocked(api.load).mockReturnValueOnce(load.promise);
  controller.start(); await settle();
  vi.mocked(api.load).mockResolvedValue({ ...stored(doc("A")), session: a });
  load.resolve({ ...stored(doc("B")), session: b });
  await settle();
  expect(controller.getSnapshot()).toMatchObject({ phase: "ready", session: a, document: doc("A") });
  expect(api.load).toHaveBeenCalledTimes(2);
  expect(api.save).not.toHaveBeenCalled();
});

it("discards late embedded-identity loads after stop and restart", async () => {
  const old = deferred<StoredPlanner>();
  vi.mocked(api.load).mockReturnValueOnce(old.promise);
  controller.start(); await settle();
  controller.stop();
  vi.mocked(api.session).mockResolvedValue(b);
  vi.mocked(api.load).mockResolvedValue({ ...stored(doc("B")), session: b });
  controller.start(); await settle();
  old.resolve({ ...stored(doc("A")), session: a }); await settle();
  expect(controller.getSnapshot()).toMatchObject({ phase: "ready", session: b, document: doc("B") });
  expect(api.save).not.toHaveBeenCalled();
});

describe("browser-only planner lifecycle", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    controller = new PlannerController(localPersistence);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("validates only once per save and retains invalid drafts without writing", async () => {
    const validate = vi.spyOn(persistence, "validateDocument");
    try {
      await start();
      validate.mockClear();
      controller.edit(() => doc("Browser"));
      expect(validate).not.toHaveBeenCalled();
      await tick();
      expect(validate).toHaveBeenCalledTimes(1);
      controller.edit(() => ({ ...doc("Invalid draft"), next_id: 0 }));
      await tick();
      expect(controller.getSnapshot()).toMatchObject({ document: { next_id: 0 }, revision: 1, saveStatus: "failed" });
      expect(await localPersistence.load(new AbortController().signal)).toMatchObject({ document: doc("Browser"), revision: 1 });
    } finally { validate.mockRestore(); }
  });

  it("debounces edits and returns to saved with browser persistence", async () => {
    await start();
    controller.edit(() => doc("Browser"));
    expect(controller.getSnapshot().saveStatus).not.toBe("saved");
    await tick();
    expect(controller.getSnapshot()).toMatchObject({ revision: 1, saveStatus: "saved", migration: null });
    expect(await localPersistence.load(new AbortController().signal)).toMatchObject({ document: doc("Browser"), revision: 1 });
  });

  it("retains edits when another tab saves before the debounce completes", async () => {
    await start();
    controller.edit(() => doc("My work"));
    await localPersistence.save(doc("Other tab"), 0, a, new AbortController().signal);
    await tick();
    expect(controller.getSnapshot()).toMatchObject({ document: doc("My work"), saveStatus: "conflict" });
    await controller.fetchLatest();
    expect(controller.getSnapshot().latest).toEqual({ document: doc("Other tab"), revision: 1 });
  });
});

describe("remote planner lifecycle", () => {
  it.each([saved(2), saved(1, doc("Local")), saved(3, doc("Local"))])("leaves migration unconfirmed for a missing echo or unexpected revision", async (result) => {
    const migration = { document: doc("Local"), warnings: [], error: null, raw: "raw", fingerprint: "raw" };
    const local = { read: () => migration, confirm: vi.fn() };
    controller = new PlannerController(api, 500, local);
    await start();
    vi.mocked(api.save).mockResolvedValueOnce(result);
    await controller.migrate();
    expect(local.confirm).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({ migration, document: doc("Remote"), revision: 1, resolving: false });
  });

  it("rejects unexpected ordinary-save revisions while retaining newer drafts", async () => {
    await start();
    vi.mocked(api.save).mockResolvedValueOnce(saved(9));
    controller.edit(() => doc("Draft")); await tick();
    expect(controller.getSnapshot()).toMatchObject({ document: doc("Draft"), revision: 1, saveStatus: "failed" });
  });
  it("recovers a committed write whose acknowledgement was lost without overwriting remote data", async () => {
    await start();
    const save = deferred<SavedPlanner>();
    vi.mocked(api.save).mockReturnValueOnce(save.promise);
    controller.edit(() => doc("Committed")); await tick();
    controller.edit(() => doc("Queued after commit"));
    // The server committed revision 2, but the browser saw a network failure.
    save.reject(new Error("Connection lost")); await settle();
    vi.mocked(api.save).mockRejectedValueOnce(new PersistenceError("revision_conflict", "Changed", 409));
    controller.retry(); await tick();
    expect(api.save).toHaveBeenLastCalledWith(doc("Queued after commit"), 1, a, expect.any(AbortSignal));
    expect(controller.getSnapshot()).toMatchObject({ document: doc("Queued after commit"), revision: 1, saveStatus: "conflict" });
    vi.mocked(api.load).mockResolvedValueOnce(stored(doc("Committed"), 2));
    await controller.fetchLatest();
    expect(controller.getSnapshot().latest).toEqual({ document: doc("Committed"), revision: 2 });
    await tick();
    expect(api.save).toHaveBeenCalledTimes(2);
    controller.resolveConflict(true); await tick();
    expect(api.save).toHaveBeenLastCalledWith(doc("Queued after commit"), 2, a, expect.any(AbortSignal));
    expect(controller.getSnapshot()).toMatchObject({ revision: 3, saveStatus: "saved" });
  });

  it("preserves local and remote copies when migration conflict recovery cannot load", async () => {
    const migration = { document: doc("Local"), warnings: [], error: null, raw: "original", fingerprint: "original" };
    const local = { read: () => migration, confirm: vi.fn() };
    controller = new PlannerController(api, 500, local);
    await start();
    vi.mocked(api.save).mockRejectedValueOnce(new PersistenceError("conflict", "Changed", 409));
    vi.mocked(api.load).mockRejectedValueOnce(new Error("Unavailable"));
    await controller.migrate(); await tick();
    expect(controller.getSnapshot()).toMatchObject({ document: doc("Remote"), revision: 1, migration, resolving: false, error: "Unavailable" });
    expect(local.confirm).not.toHaveBeenCalled();
    expect(api.save).toHaveBeenCalledTimes(1);
    vi.mocked(api.save).mockRejectedValueOnce(new PersistenceError("conflict", "Changed", 409));
    vi.mocked(api.load).mockResolvedValueOnce(stored(doc("Latest"), 4));
    await controller.migrate();
    expect(local.confirm).not.toHaveBeenCalled();
    await controller.migrate();
    expect(api.save).toHaveBeenLastCalledWith(doc("Local"), 4, a, expect.any(AbortSignal), { echoDocument: true });
    expect(local.confirm).toHaveBeenCalledWith(1, "original");
  });

  it("requires explicit migration, preserves failures/cancellation, and confirms only acknowledged uploads", async () => {
    const migration = { document: doc("Local"), warnings: [], error: null, raw: "original", fingerprint: "original" };
    const local = { read: vi.fn(() => migration), confirm: vi.fn() };
    controller = new PlannerController(api, 500, local);
    await start();
    controller.edit(() => doc("Blocked")); await tick();
    expect(api.save).not.toHaveBeenCalled();
    vi.mocked(api.save).mockRejectedValueOnce(new Error("Offline"));
    await controller.migrate();
    expect(controller.getSnapshot().migration).toEqual(migration);
    expect(local.confirm).not.toHaveBeenCalled();
    controller.chooseRemote();
    expect(controller.getSnapshot().document).toEqual(doc("Remote"));
    controller.stop(); controller = new PlannerController(api, 500, local); await start();
    await controller.migrate();
    expect(local.confirm).toHaveBeenCalledWith(1, "original");
    expect(controller.getSnapshot()).toMatchObject({ document: doc("Local"), revision: 2, migration: null });
  });
  it("offers a fresh explicit choice after a migration conflict", async () => {
    const local = { read: () => ({ document: doc("Local"), warnings: [], error: null, raw: "raw", fingerprint: "raw" }), confirm: vi.fn() };
    controller = new PlannerController(api, 500, local);
    await start();
    vi.mocked(api.save).mockRejectedValueOnce(new PersistenceError("conflict", "Changed", 409));
    vi.mocked(api.load).mockResolvedValue(stored(doc("New remote"), 7));
    await controller.migrate();
    expect(controller.getSnapshot()).toMatchObject({ document: doc("New remote"), revision: 7 });
    expect(local.confirm).not.toHaveBeenCalled();
    await controller.migrate();
    expect(api.save).toHaveBeenLastCalledWith(doc("Local"), 7, a, expect.any(AbortSignal), { echoDocument: true });
  });
  it("does not acknowledge an unconfirmed migration or a late save to a previous account", async () => {
    const local = { read: () => ({ document: doc("Local"), warnings: [], error: null, raw: "raw", fingerprint: "raw" }), confirm: vi.fn() };
    controller = new PlannerController(api, 500, local);
    vi.mocked(api.load).mockResolvedValue(stored(null));
    await start();
    vi.mocked(api.save).mockResolvedValueOnce(saved(1, doc("Wrong")));
    await controller.migrate();
    expect(local.confirm).not.toHaveBeenCalled();
    expect(controller.getSnapshot().migration).toBeTruthy();
    const save = deferred<SavedPlanner>();
    vi.mocked(api.save).mockReturnValueOnce(save.promise);
    const migrating = controller.migrate(); await settle();
    const generation = controller.getSnapshot().generation;
    vi.mocked(api.session).mockResolvedValue(b);
    vi.mocked(api.load).mockResolvedValue(stored(doc("B"), 8));
    await controller.refresh();
    save.resolve(saved(1, doc("Local"))); await migrating;
    expect(local.confirm).not.toHaveBeenCalled();
    expect(controller.getSnapshot().document).toEqual(doc("B"));
    await controller.migrate(generation);
    expect(api.save).toHaveBeenCalledTimes(2);
  });
  it("accepts a confirmed migration with reordered JSON keys", async () => {
    const document = doc("Local");
    const local = { read: () => ({ document, warnings: [], error: null, raw: "raw", fingerprint: "raw" }), confirm: vi.fn() };
    controller = new PlannerController(api, 500, local);
    await start();
    vi.mocked(api.save).mockResolvedValueOnce(saved(2, { next_id: document.next_id, events: document.events, pools: document.pools, version: document.version }));
    await controller.migrate();
    expect(local.confirm).toHaveBeenCalledWith(1, "raw");
  });
  it("retains both copies and requires another explicit choice after repeated conflicts", async () => {
    await start();
    vi.mocked(api.save).mockRejectedValue(new PersistenceError("conflict", "Changed", 409));
    controller.edit(() => doc("Mine")); await tick();
    vi.mocked(api.load).mockResolvedValue(stored(doc("Latest"), 5));
    await controller.fetchLatest();
    expect(controller.getSnapshot().document).toEqual(doc("Mine"));
    controller.resolveConflict(true); await tick();
    expect(api.save).toHaveBeenLastCalledWith(doc("Mine"), 5, a, expect.any(AbortSignal));
    expect(controller.getSnapshot()).toMatchObject({ saveStatus: "conflict", latest: null });
    controller.resolveConflict(true); await tick();
    expect(api.save).toHaveBeenCalledTimes(2);
    await controller.fetchLatest(); controller.resolveConflict(false);
    expect(controller.getSnapshot().document).toEqual(doc("Latest"));
    expect(controller.getSnapshot().recoveries[0]?.document).toEqual(doc("Mine"));
  });
  it("ignores late conflict loads and migration acknowledgements across account changes", async () => {
    await start();
    vi.mocked(api.save).mockRejectedValueOnce(new PersistenceError("conflict", "Changed", 409));
    controller.edit(() => doc("Mine")); await tick();
    const load = deferred<StoredPlanner>();
    vi.mocked(api.load).mockReturnValueOnce(load.promise);
    const fetching = controller.fetchLatest();
    vi.mocked(api.session).mockResolvedValue(b);
    vi.mocked(api.load).mockResolvedValue(stored(doc("B"), 8));
    await controller.refresh();
    load.resolve(stored(doc("A"), 4)); await fetching;
    expect(controller.getSnapshot()).toMatchObject({ session: b, document: doc("B"), latest: null });
  });
  it("retains edits through failed latest loads and edits made while fetching", async () => {
    await start();
    vi.mocked(api.save).mockRejectedValueOnce(new PersistenceError("conflict", "Changed", 409));
    controller.edit(() => doc("Mine")); await tick();
    vi.mocked(api.load).mockRejectedValueOnce(new Error("Offline"));
    await controller.fetchLatest();
    expect(controller.getSnapshot()).toMatchObject({ document: doc("Mine"), saveStatus: "conflict", latest: null, error: "Offline" });
    const load = deferred<StoredPlanner>();
    vi.mocked(api.load).mockReturnValueOnce(load.promise);
    const fetching = controller.fetchLatest();
    controller.edit(() => doc("Newer edits"));
    load.resolve(stored(doc("Remote latest"), 9)); await fetching;
    expect(controller.getSnapshot().document).toEqual(doc("Newer edits"));
    controller.resolveConflict(true); await tick();
    expect(api.save).toHaveBeenLastCalledWith(doc("Newer edits"), 9, a, expect.any(AbortSignal));
  });
  it("never writes on initial load, even for an empty account or effect replay", async () => {
    const load = deferred<StoredPlanner>();
    vi.mocked(api.load).mockReturnValue(load.promise);
    controller.start(); await settle();
    controller.edit(() => doc("Too early"));
    await tick();
    controller.stop(); controller.start(); await settle();
    load.resolve(stored(null)); await settle(); await tick();
    expect(controller.getSnapshot().phase).toBe("ready");
    expect(controller.getSnapshot().revision).toBe(0);
    expect(api.save).not.toHaveBeenCalled();
    controller.edit(() => doc("First edit")); await tick();
    expect(api.save).toHaveBeenCalledWith(doc("First edit"), 0, a, expect.any(AbortSignal));
  });

  it("debounces edits and queues the latest draft behind exactly one in-flight save", async () => {
    await start();
    const save = deferred<SavedPlanner>();
    vi.mocked(api.save).mockReturnValueOnce(save.promise);
    controller.edit(() => doc("One"));
    await vi.advanceTimersByTimeAsync(250);
    controller.edit(() => doc("Two"));
    await vi.advanceTimersByTimeAsync(250);
    expect(api.save).not.toHaveBeenCalled();
    await tick();
    controller.edit(() => doc("Three")); controller.edit(() => doc("Four")); await tick();
    expect(api.save).toHaveBeenCalledTimes(1);
    save.resolve(saved(2)); await settle();
    expect(controller.getSnapshot().document).toEqual(doc("Four"));
    expect(controller.getSnapshot().saveStatus).toBe("pending");
    await tick();
    expect(api.save).toHaveBeenLastCalledWith(doc("Four"), 2, a, expect.any(AbortSignal));
    expect(controller.getSnapshot().saveStatus).toBe("saved");
  });

  it("retains newer edits after a failed write and retries them at the unchanged revision", async () => {
    await start();
    const save = deferred<SavedPlanner>();
    vi.mocked(api.save).mockReturnValueOnce(save.promise);
    controller.edit(() => doc("One")); await tick();
    controller.edit(() => doc("Two"));
    save.reject(new Error("Offline")); await settle(); await tick();
    expect(controller.getSnapshot()).toMatchObject({ document: doc("Two"), revision: 1, saveStatus: "failed", error: "Offline" });
    controller.edit(() => doc("Three")); await tick();
    expect(api.save).toHaveBeenCalledTimes(1);
    controller.retry(); await tick();
    expect(api.save).toHaveBeenLastCalledWith(doc("Three"), 1, a, expect.any(AbortSignal));
    expect(controller.getSnapshot().saveStatus).toBe("saved");
  });

  it("halts on conflict, retains the draft and never blindly retries a newer revision", async () => {
    await start();
    vi.mocked(api.save).mockRejectedValue(new PersistenceError("revision_conflict", "Changed remotely", 409));
    controller.edit(() => doc("Mine")); await tick();
    controller.retry(); controller.edit(() => doc("Still mine")); await tick();
    expect(controller.getSnapshot()).toMatchObject({ document: doc("Still mine"), revision: 1, saveStatus: "conflict" });
    expect(api.save).toHaveBeenCalledTimes(1);
  });

  it("ignores late save responses after an account switch and guards old editor callbacks", async () => {
    await start();
    const generation = controller.getSnapshot().generation;
    const save = deferred<SavedPlanner>();
    vi.mocked(api.save).mockReturnValueOnce(save.promise);
    controller.edit(() => doc("Account A edits")); await tick();
    vi.mocked(api.session).mockResolvedValue(b);
    vi.mocked(api.load).mockResolvedValue(stored(doc("Account B"), 8));
    await controller.refresh();
    save.resolve(saved(2)); await settle();
    controller.edit(() => doc("Stale import"), generation); await tick();
    expect(controller.getSnapshot()).toMatchObject({ session: b, document: doc("Account B"), revision: 8, saveStatus: "saved" });
    expect(controller.getSnapshot().recoveries).toEqual([{ userId: 1, document: doc("Account A edits") }]);
    expect(api.save).toHaveBeenCalledTimes(1);
    controller.edit(() => doc("B edit")); await tick();
    expect(api.save).toHaveBeenLastCalledWith(doc("B edit"), 8, b, expect.any(AbortSignal));
  });

  it("does not apply a planner loaded across a cookie/account change", async () => {
    vi.mocked(api.session).mockResolvedValueOnce(a).mockResolvedValue(b);
    vi.mocked(api.load).mockResolvedValueOnce(stored(doc("Wrong account"))).mockResolvedValue(stored(doc("B"), 9));
    await start();
    expect(controller.getSnapshot()).toMatchObject({ session: b, document: doc("B"), revision: 9 });
    expect(api.save).not.toHaveBeenCalled();
  });

  it("invalidates queued saves on logout and retains unsaved work for export", async () => {
    await start();
    controller.edit(() => doc("Queued"));
    await controller.logout(); await tick();
    expect(api.save).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({ phase: "signed-out", session: null });
    expect(controller.getSnapshot().recoveries[0]?.document).toEqual(doc("Queued"));
  });

  it("ignores an in-flight save acknowledgement after logout", async () => {
    await start();
    const save = deferred<SavedPlanner>();
    vi.mocked(api.save).mockReturnValueOnce(save.promise);
    controller.edit(() => doc("In flight")); await tick();
    const signal = vi.mocked(api.save).mock.calls[0]![3];
    await controller.logout();
    expect(signal.aborted).toBe(true);
    save.resolve(saved(2)); await settle(); await tick();
    expect(controller.getSnapshot()).toMatchObject({ phase: "signed-out", revision: 0, session: null });
    expect(controller.getSnapshot().recoveries[0]?.document).toEqual(doc("In flight"));
  });

  it("retains a draft on logout failure and requires retry instead of resuming an aborted write", async () => {
    await start();
    vi.mocked(api.logout).mockRejectedValueOnce(new Error("Offline"));
    controller.edit(() => doc("Draft"));
    await controller.logout(); await settle(); await tick();
    expect(controller.getSnapshot()).toMatchObject({ phase: "ready", saveStatus: "failed", document: doc("Draft") });
    expect(api.save).not.toHaveBeenCalled();
    controller.retry(); await tick();
    expect(api.save).toHaveBeenCalledWith(doc("Draft"), 1, a, expect.any(AbortSignal));
  });

  it("ignores late loads after logout, stop, or superseding initialization", async () => {
    const old = deferred<StoredPlanner>();
    vi.mocked(api.load).mockReturnValueOnce(old.promise);
    controller.start(); await settle(); controller.stop();
    vi.mocked(api.session).mockResolvedValue(b);
    vi.mocked(api.load).mockResolvedValue(stored(doc("B"), 3));
    await start(); old.resolve(stored(doc("A"))); await settle();
    expect(controller.getSnapshot()).toMatchObject({ session: b, document: doc("B"), revision: 3 });
  });

  it("retains edits on session expiry without uploading them on the next login", async () => {
    await start();
    controller.edit(() => doc("Unsaved"));
    vi.mocked(api.save).mockRejectedValueOnce(new PersistenceError("unauthenticated", "Session expired", 401));
    vi.mocked(api.session).mockRejectedValue(new PersistenceError("unauthenticated", "Session expired", 401));
    await tick(); await settle();
    expect(controller.getSnapshot().phase).toBe("signed-out");
    expect(controller.getSnapshot().recoveries[0]?.document).toEqual(doc("Unsaved"));
    vi.mocked(api.session).mockResolvedValue(b);
    vi.mocked(api.load).mockResolvedValue(stored(null));
    await controller.refresh(); await tick();
    expect(controller.getSnapshot().document.pools).toEqual([]);
    expect(api.save).toHaveBeenCalledTimes(1);
  });

  it("supports retrying initial-load failures without an empty write", async () => {
    vi.mocked(api.load).mockRejectedValueOnce(new Error("Unavailable"));
    await start(); expect(controller.getSnapshot().phase).toBe("error");
    controller.retry(); await settle(); await tick();
    expect(controller.getSnapshot().document).toEqual(doc("Remote"));
    expect(api.save).not.toHaveBeenCalled();
  });

  it("saves normalized imports and synchronized settings in one revision", async () => {
    await start();
    controller.edit(() => ({ ...doc("Imported"), settings: { ...defaultSettings, ignoreWeekends: true } }));
    await tick();
    expect(api.save).toHaveBeenCalledWith({ ...doc("Imported"), settings: { ...defaultSettings, ignoreWeekends: true } }, 1, a, expect.any(AbortSignal));
  });
});
