// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyStore, loadStore } from "./model";
import { useStoredPlanner } from "./useStoredPlanner";
import App from "./App";

vi.mock("./BalanceChart", () => ({ BalanceChart: () => null }));

const key = "hima.store.v1";
const backup = `${key}.backup`;
const replacement = { ...emptyStore(), pools: [{ id: 1, name: "New leave", additions: [], recurring: [], caps: [] }], next_id: 2 };
let root: Root;
let container: HTMLDivElement;

function Planner() {
  const { store, setStore, storageWarning } = useStoredPlanner();
  return <>
    {storageWarning && <p role="alert">{storageWarning}</p>}
    <span>{store.pools.map((pool) => pool.name).join(", ")}</span>
    <button onClick={() => setStore(replacement)}>Change planner</button>
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
