// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useStoredPlanner } from "./useStoredPlanner";
import { plannerApi } from "./plannerApi";
import { defaultSettings, PersistenceError } from "./plannerPersistence";
import { emptyStore } from "./model";
import App from "./App";

vi.mock("./BalanceChart", () => ({ BalanceChart: () => null }));
let root: Root;
let container: HTMLDivElement;
const remote = { ...emptyStore(), pools: [{ id: 1, name: "Remote leave", additions: [], recurring: [], caps: [] }], next_id: 2, settings: { ...defaultSettings, firstDayOfWeek: "Sunday" as const } };
let planner: ReturnType<typeof useStoredPlanner>;
function Probe() { planner = useStoredPlanner(); return <span>{planner.phase}</span>; }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  vi.spyOn(plannerApi, "session").mockResolvedValue({ user_id: 1, csrf_token: "a" });
  vi.spyOn(plannerApi, "load").mockResolvedValue({ document: remote, revision: 7, updated_at: "now" });
  vi.spyOn(plannerApi, "save").mockImplementation(async (document, revision) => ({ document, revision: revision + 1, updated_at: "now" }));
  vi.spyOn(plannerApi, "logout").mockResolvedValue();
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); localStorage.clear();
  vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals();
});
const tick = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(500); }); };
it("loads settings in StrictMode, preserves local bytes and routes edits/import through one queued save", async () => {
  localStorage.setItem("hima.store.v1", "legacy planner bytes");
  localStorage.setItem("hima.settings.v1", "legacy settings bytes");
  const write = vi.spyOn(Storage.prototype, "setItem");
  await act(async () => root.render(<StrictMode><Probe /></StrictMode>));
  expect(planner.settings.firstDayOfWeek).toBe("Sunday");
  await tick(); expect(plannerApi.save).not.toHaveBeenCalled();
  await act(async () => {
    planner.setStore((store) => ({ ...store, pools: store.pools.map((pool) => ({ ...pool, name: "Changed" })) }));
    planner.setSettings({ ignoreWeekends: true });
  });
  await tick();
  expect(plannerApi.save).toHaveBeenCalledWith(expect.objectContaining({ pools: [expect.objectContaining({ name: "Changed" })], settings: { ...remote.settings, ignoreWeekends: true } }), 7, expect.anything(), expect.any(AbortSignal));
  await act(async () => planner.importBackup(emptyStore(), defaultSettings)); await tick();
  expect(plannerApi.save).toHaveBeenLastCalledWith({ ...emptyStore(), settings: defaultSettings }, 8, expect.anything(), expect.any(AbortSignal));
  expect(write).not.toHaveBeenCalled();
  expect(localStorage.getItem("hima.store.v1")).toBe("legacy planner bytes");
  expect(localStorage.getItem("hima.settings.v1")).toBe("legacy settings bytes");
});

it("rejects stale async-import callbacks after account transition", async () => {
  await act(async () => root.render(<Probe />));
  const oldImport = planner.importBackup;
  const oldLogout = planner.logout;
  vi.mocked(plannerApi.session).mockResolvedValue({ user_id: 2, csrf_token: "b" });
  vi.mocked(plannerApi.load).mockResolvedValue({ document: null, revision: 0, updated_at: null });
  await act(async () => window.dispatchEvent(new Event("focus")));
  await act(async () => { oldImport(remote, remote.settings); await oldLogout(); }); await tick();
  expect(planner.store.pools).toEqual([]); expect(plannerApi.save).not.toHaveBeenCalled();
  expect(plannerApi.logout).not.toHaveBeenCalled();
});

it("shows login and initial-loading states without exposing an editable empty planner", async () => {
  vi.mocked(plannerApi.session).mockRejectedValue(new PersistenceError("unauthenticated", "Sign in", 401));
  await act(async () => root.render(<StrictMode><App /></StrictMode>));
  expect(container.querySelector('a[href="/auth/login"]')?.textContent).toBe("Sign in");
  expect(container.querySelector(".balance-card")).toBeNull();
  expect(plannerApi.save).not.toHaveBeenCalled();
});

it("shows failed-save retry and exports retained in-memory data after session expiry", async () => {
  await act(async () => root.render(<App />));
  const settingsButton = container.querySelector<HTMLButtonElement>('[aria-label="Open settings"]')!;
  await act(async () => settingsButton.click());
  const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  vi.mocked(plannerApi.save).mockRejectedValueOnce(new Error("Offline"));
  await act(async () => checkbox.click()); await tick();
  expect(container.querySelector("header")?.textContent).toContain("Save failed");
  const retry = [...container.querySelectorAll("button")].find((button) => button.textContent === "Retry save")!;
  await act(async () => retry.click()); await tick();
  expect(container.querySelector("header")?.textContent).toContain("Saved to your account");
  vi.mocked(plannerApi.save).mockRejectedValueOnce(new PersistenceError("unauthenticated", "Expired", 401));
  vi.mocked(plannerApi.session).mockRejectedValue(new PersistenceError("unauthenticated", "Expired", 401));
  await act(async () => checkbox.click()); await tick();
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:backup");
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const exportButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Export retained backup")!;
  await act(async () => exportButton.click());
  expect(createObjectURL).toHaveBeenCalledOnce();
  const blob = createObjectURL.mock.calls[0]![0];
  vi.useRealTimers();
  const text = await new Promise<string>((resolve) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.readAsText(blob);
  });
  expect(JSON.parse(text)).toEqual({ ...remote, settings: { ...remote.settings, ignoreWeekends: false } });
  expect(container.querySelector('a[href="/auth/login"]')).not.toBeNull();
});

it("confirms a backup replacement and sends normalized data and selected settings through the remote save path", async () => {
  await act(async () => root.render(<App />));
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Open settings"]')!.click());
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Import JSON")!.click());
  await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Choose backup file")!.click());
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  const imported = { ...emptyStore(), pools: [{ id: 1, name: "Imported", additions: [{ id: 2, amount: "1.234", date: "2026-01-01" }], recurring: [], caps: [] }], next_id: 3, settings: defaultSettings };
  Object.defineProperty(input, "files", { configurable: true, value: [{ text: async () => JSON.stringify(imported) }] });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Replace this account's planner"));
  await tick();
  expect(plannerApi.save).toHaveBeenCalledWith({ ...imported, pools: [{ ...imported.pools[0], additions: [{ id: 2, amount: 1.23, date: "2026-01-01" }] }] }, 7, expect.anything(), expect.any(AbortSignal));
});

it("ignores a backup file read completed after account switching", async () => {
  await act(async () => root.render(<App />));
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  let finish!: (text: string) => void;
  Object.defineProperty(input, "files", { configurable: true, value: [{ text: () => new Promise<string>((resolve) => { finish = resolve; }) }] });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  vi.mocked(plannerApi.session).mockResolvedValue({ user_id: 2, csrf_token: "b" });
  vi.mocked(plannerApi.load).mockResolvedValue({ document: null, revision: 0, updated_at: null });
  await act(async () => window.dispatchEvent(new Event("focus")));
  await act(async () => finish(JSON.stringify(remote))); await tick();
  expect(confirm).not.toHaveBeenCalled(); expect(plannerApi.save).not.toHaveBeenCalled();
  expect(container.textContent).not.toContain("Remote leave");
});
