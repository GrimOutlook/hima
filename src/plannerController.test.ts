import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlannerController } from "./plannerController";
import { emptyStore } from "./model";
import { defaultSettings, PersistenceError, type PlannerDocument, type PlannerPersistence, type StoredPlanner } from "./plannerPersistence";

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
let api: PlannerPersistence;
let controller: PlannerController;
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const tick = async () => { await vi.advanceTimersByTimeAsync(500); };
beforeEach(() => {
  vi.useFakeTimers();
  api = {
    session: vi.fn(async () => a), load: vi.fn(async () => stored(doc("Remote"))),
    save: vi.fn(async (document, revision) => stored(document, revision + 1)), logout: vi.fn(async () => {}),
  };
  controller = new PlannerController(api);
});
afterEach(() => { controller.stop(); vi.useRealTimers(); });
async function start() { controller.start(); await settle(); }

describe("remote planner lifecycle", () => {
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
    const save = deferred<StoredPlanner>();
    vi.mocked(api.save).mockReturnValueOnce(save.promise);
    controller.edit(() => doc("One"));
    await vi.advanceTimersByTimeAsync(250);
    controller.edit(() => doc("Two"));
    await vi.advanceTimersByTimeAsync(250);
    expect(api.save).not.toHaveBeenCalled();
    await tick();
    controller.edit(() => doc("Three")); controller.edit(() => doc("Four")); await tick();
    expect(api.save).toHaveBeenCalledTimes(1);
    save.resolve(stored(doc("Two"), 2)); await settle();
    expect(controller.getSnapshot().document).toEqual(doc("Four"));
    expect(controller.getSnapshot().saveStatus).toBe("pending");
    await tick();
    expect(api.save).toHaveBeenLastCalledWith(doc("Four"), 2, a, expect.any(AbortSignal));
    expect(controller.getSnapshot().saveStatus).toBe("saved");
  });

  it("retains newer edits after a failed write and retries them at the unchanged revision", async () => {
    await start();
    const save = deferred<StoredPlanner>();
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
    const save = deferred<StoredPlanner>();
    vi.mocked(api.save).mockReturnValueOnce(save.promise);
    controller.edit(() => doc("Account A edits")); await tick();
    vi.mocked(api.session).mockResolvedValue(b);
    vi.mocked(api.load).mockResolvedValue(stored(doc("Account B"), 8));
    await controller.refresh();
    save.resolve(stored(doc("Account A edits"), 2)); await settle();
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
    const save = deferred<StoredPlanner>();
    vi.mocked(api.save).mockReturnValueOnce(save.promise);
    controller.edit(() => doc("In flight")); await tick();
    const signal = vi.mocked(api.save).mock.calls[0]![3];
    await controller.logout();
    expect(signal.aborted).toBe(true);
    save.resolve(stored(doc("In flight"), 2)); await settle(); await tick();
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
