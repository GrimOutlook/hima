// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyStore, loadStore, saveStore } from "./model";
import { useStoredPlanner } from "./useStoredPlanner";
import App from "./App";

vi.mock("./BalanceChart", () => ({ BalanceChart: () => null }));

const key = "hima.store.v1";
const backup = `${key}.backup`;
const replacement = { ...emptyStore(), pools: [{ id: 1, name: "New leave", additions: [], recurring: [], caps: [] }], next_id: 2 };
let root: Root;
let container: HTMLDivElement;

function Planner({ name = "New leave" }: { name?: string }) {
  const { store, setStore, storageWarning, saveStatus } = useStoredPlanner();
  return <>
    {storageWarning && <p role="alert">{storageWarning}</p>}
    <span>{store.pools.map((pool) => pool.name).join(", ")}</span>
    <span role="status">{saveStatus}</span>
    <button onClick={() => setStore({ ...replacement, pools: replacement.pools.map((pool) => ({ ...pool, name })) })}>Change planner</button>
  </>;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount() {
  await act(async () => root.render(<StrictMode><Planner /></StrictMode>));
}

async function changePlanner() {
  await act(async () => container.querySelector("button")!.click());
}

describe("saved planner recovery", () => {
  it.each([JSON.stringify(replacement), null, "damaged remote data"])("preserves both copies after an external change: %s", async (remote) => {
    await mount();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    if (remote === null) localStorage.clear();
    else localStorage.setItem(key, remote);
    setItem.mockClear();
    await act(async () => window.dispatchEvent(new StorageEvent("storage", {
      key: remote === null ? null : key, newValue: remote, storageArea: localStorage,
    })));
    await changePlanner();
    expect(container.textContent).toContain("New leave");
    expect(container.querySelector('[role="status"]')?.textContent).toBe("disabled");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("another tab");
    expect(localStorage.getItem(key)).toBe(remote);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("detects a remote write before its storage notification arrives", async () => {
    await mount();
    const remote = JSON.stringify({ ...replacement, next_id: 100 });
    localStorage.setItem(key, remote);
    await changePlanner();
    expect(localStorage.getItem(key)).toBe(remote);
    expect(container.querySelector('[role="status"]')?.textContent).toBe("disabled");
    expect(container.textContent).toContain("New leave");
  });

  it("checks storage inside the cross-tab lock and cancels obsolete queued saves", async () => {
    const pending: (() => void)[] = [];
    const request = vi.fn((_name: string, callback: () => void) => new Promise<void>((resolve) => {
      pending.push(() => { callback(); resolve(); });
    }));
    Object.defineProperty(navigator, "locks", { configurable: true, value: { request } });
    try {
      await mount();
      await changePlanner();
      const remote = JSON.stringify({ ...replacement, next_id: 100 });
      localStorage.setItem(key, remote);
      await act(async () => { pending.forEach((run) => run()); });
      expect(request).toHaveBeenCalledWith(key, expect.any(Function));
      expect(localStorage.getItem(key)).toBe(remote);
      expect(container.querySelector('[role="status"]')?.textContent).toBe("disabled");
      expect(container.textContent).toContain("New leave");
    } finally {
      Reflect.deleteProperty(navigator, "locks");
    }
  });

  it("serializes two tabs racing to save and keeps the losing tab's edits exportable", async () => {
    localStorage.setItem(key, JSON.stringify(emptyStore()));
    const pending: (() => void)[] = [];
    Object.defineProperty(navigator, "locks", { configurable: true, value: {
      request: (_name: string, callback: () => void) => new Promise<void>((resolve) => {
        pending.push(() => { callback(); resolve(); });
      }),
    } });
    const otherContainer = document.createElement("div");
    const otherRoot = createRoot(otherContainer);
    try {
      await mount();
      await act(async () => otherRoot.render(<Planner name="Other tab's leave" />));
      await act(async () => { pending.splice(0).forEach((run) => run()); });
      await act(async () => {
        container.querySelector("button")!.click();
        otherContainer.querySelector("button")!.click();
      });
      await act(async () => { pending.splice(0).forEach((run) => run()); });
      expect(JSON.parse(localStorage.getItem(key)!)).toEqual(replacement);
      expect(container.querySelector('[role="status"]')?.textContent).toBe("saved");
      expect(otherContainer.querySelector('[role="status"]')?.textContent).toBe("disabled");
      expect(otherContainer.textContent).toContain("Other tab's leave");
      expect(otherContainer.querySelector('[role="alert"]')?.textContent).toContain("Export a backup");
    } finally {
      await act(async () => otherRoot.unmount());
      Reflect.deleteProperty(navigator, "locks");
    }
  });

  it("ignores unrelated storage and stale notifications without writing back", async () => {
    await mount();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: "hima.settings.v1", storageArea: localStorage }));
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: "old value", storageArea: localStorage }));
      window.dispatchEvent(new StorageEvent("storage", { key, storageArea: sessionStorage }));
    });
    expect(container.querySelector('[role="status"]')?.textContent).toBe("saved");
    expect(setItem).not.toHaveBeenCalled();
  });

  it.each(["QuotaExceededError", "SecurityError"])("reports %s, retains edits and recovers on the next successful save", async (error) => {
    const original = JSON.stringify(emptyStore());
    localStorage.setItem(key, original);
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Cannot save", error);
    });
    expect(saveStore(replacement)).toBe(false);
    await mount();
    expect(container.querySelector('[role="status"]')?.textContent).toBe("failed");
    await changePlanner();
    expect(container.textContent).toContain("New leave");
    expect(container.querySelector('[role="status"]')?.textContent).toBe("failed");
    expect(localStorage.getItem(key)).toBe(original);
    setItem.mockRestore();
    await changePlanner();
    expect(container.querySelector('[role="status"]')?.textContent).toBe("saved");
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(replacement);
    expect(saveStore(replacement)).toBe(true);
  });

  it("shows failed saves in the app header and exports the in-memory planner", async () => {
    localStorage.setItem(key, JSON.stringify(replacement));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage full", "QuotaExceededError");
    });
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:backup");
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await act(async () => root.render(<StrictMode><App /></StrictMode>));
    expect(container.querySelector('header [role="status"]')?.textContent).toBe("Save failed");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Export a backup");
    expect(container.textContent).not.toContain("Saved on this device");
    const exportButton = [...container.querySelectorAll("header button")].find((button) => button.textContent === "Export backup") as HTMLButtonElement;
    await act(async () => exportButton.click());
    expect(click).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const json = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(blob);
    });
    expect(JSON.parse(json)).toEqual({
      ...replacement,
      settings: { firstDayOfWeek: "Monday", ignoreWeekends: false, defaultTimeline: "±6 month" },
    });
  });

  it("never claims saving succeeded when storage reads disable saving", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Access denied", "SecurityError");
    });
    await act(async () => root.render(<StrictMode><App /></StrictMode>));
    expect(container.querySelector('header [role="status"]')?.textContent).toBe("Saving disabled");
    expect(container.textContent).not.toContain("Saved on this device");
    expect(container.querySelector("header")?.textContent).toContain("Export backup");
  });

  it("shows the recovery warning in the actual app without overwriting saved data", async () => {
    const raw = '{"pools":[{"name":"Recover me"}';
    localStorage.setItem(key, raw);
    await act(async () => root.render(<StrictMode><App /></StrictMode>));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(backup);
    expect(localStorage.getItem(key)).toBe(raw);
    expect(localStorage.getItem(backup)).toBe(raw);
  });

  it.each(['{"pools":[{"name":"Recover me"}', "", "null", "[]", '{"pools":[]}'])(
    "preserves unreadable data byte-for-byte through StrictMode mount and edits: %s", async (raw) => {
      localStorage.setItem(key, raw);
      await mount();
      expect(localStorage.getItem(key)).toBe(raw);
      expect(localStorage.getItem(backup)).toBe(raw);
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(backup);
      expect(localStorage.length).toBe(2);
      await changePlanner();
      expect(JSON.parse(localStorage.getItem(key)!)).toEqual(replacement);
      expect(localStorage.getItem(backup)).toBe(raw);
      await act(async () => root.unmount());
      root = createRoot(container);
      await mount();
      expect(container.textContent).toContain("New leave");
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(localStorage.getItem(backup)).toBe(raw);
    },
  );

  it("keeps earlier backups and reuses the recovery copy on reload", async () => {
    localStorage.setItem(backup, "earlier damaged data");
    localStorage.setItem(key, "new damaged data");
    await mount();
    expect(localStorage.getItem(backup)).toBe("earlier damaged data");
    expect(localStorage.getItem(`${backup}.1`)).toBe("new damaged data");
    expect(loadStore().warning).toContain(`${backup}.1`);
    expect(localStorage.length).toBe(3);
    expect(localStorage.getItem(key)).toBe("new damaged data");
  });

  it("does not overwrite the original even after edits when backup storage is full", async () => {
    localStorage.setItem(key, "recoverable raw data");
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage full", "QuotaExceededError");
    });
    await mount();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Saving is disabled");
    expect(localStorage.getItem(key)).toBe("recoverable raw data");
    setItem.mockRestore();
    await changePlanner();
    expect(localStorage.getItem(key)).toBe("recoverable raw data");
    expect(localStorage.getItem(backup)).toBeNull();
  });

  it("disables saving if reading storage fails", async () => {
    const original = JSON.stringify({ ...replacement, next_id: 100 });
    localStorage.setItem(key, original);
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Access denied", "SecurityError");
    });
    await mount();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not be read");
    getItem.mockRestore();
    await changePlanner();
    expect(localStorage.getItem(key)).toBe(original);
  });

  it.each([null, JSON.stringify(replacement)])("continues saving for healthy storage: %s", async (raw) => {
    if (raw !== null) localStorage.setItem(key, raw);
    await mount();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(raw === null ? emptyStore() : replacement);
    await changePlanner();
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(replacement);
    expect(localStorage.getItem(backup)).toBeNull();
  });
});
