// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ConflictPanel, MigrationScreen } from "./PlannerScreens";
import { emptyStore } from "./model";
import { defaultSettings } from "./settings";
import { downloadBackup, downloadJson } from "./backupDownload";

vi.mock("./backupDownload", () => ({ downloadBackup: vi.fn(), downloadJson: vi.fn() }));

function plannerState(): ComponentProps<typeof ConflictPanel>["planner"] {
  const document = { ...emptyStore(), settings: defaultSettings };
  return {
    phase: "ready", session: { user_id: 1, csrf_token: "test" }, document, revision: 1,
    saveStatus: "conflict", error: null, generation: 0, recoveries: [],
    mode: "local", store: document, settings: defaultSettings,
    setStore: vi.fn(), setSettings: vi.fn(), retry: vi.fn(), logout: vi.fn(), logoutEverywhere: vi.fn(),
    fetchLatest: vi.fn(), resolveConflict: vi.fn(), chooseRemote: vi.fn(), migrate: vi.fn(),
    finishLocalMigration: vi.fn(), importBackup: vi.fn(),
  };
}

it.each(["local", "remote"] as const)("exports both conflict copies and requires confirmation to resolve %s conflicts", async (mode) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const planner = { ...plannerState(), mode, latest: { document: emptyStore(), revision: 2 } };
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const source = mode === "local" ? "browser" : "remote";
  const click = async (label: string) => act(async () => {
    Array.from(container.querySelectorAll("button")).find((button) => button.textContent === label)!.click();
  });
  try {
    await act(async () => root.render(<ConflictPanel planner={planner} />));
    await click("Export unsaved work");
    expect(downloadBackup).toHaveBeenLastCalledWith(planner.document);
    await click(`Export latest ${source} backup`);
    expect(downloadBackup).toHaveBeenLastCalledWith(planner.latest.document);
    await click(`Fetch latest ${source} copy`);
    expect(planner.fetchLatest).toHaveBeenCalledOnce();
    await click(`Load latest ${source} copy`);
    expect(planner.resolveConflict).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await click(`Load latest ${source} copy`);
    expect(planner.resolveConflict).toHaveBeenLastCalledWith(false);
    await click(`Replace ${mode === "local" ? "browser copy" : "remote"} with my work`);
    expect(planner.resolveConflict).toHaveBeenLastCalledWith(true);
    planner.resolving = true;
    await act(async () => root.render(<ConflictPanel planner={planner} />));
    expect(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === `Fetch latest ${source} copy`)?.disabled).toBe(true);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("keeps original migration backups available when migration fails and confirms uploads", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const planner = plannerState();
  planner.mode = "remote";
  const migration = { raw: "original", fingerprint: "test", document: null, warnings: ["Check local data"], error: "Invalid backup" };
  planner.migration = migration;
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const button = (label: string) => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === label)!;
  try {
    await act(async () => root.render(<MigrationScreen planner={planner} />));
    expect(container.textContent).toContain("Invalid backup");
    expect(container.textContent).toContain("Check local data");
    expect(button("Upload local planner and settings").disabled).toBe(true);
    await act(async () => button("Export original local backup").click());
    expect(downloadJson).toHaveBeenLastCalledWith("original");
    planner.migration = { ...migration, document: emptyStore(), error: null };
    await act(async () => root.render(<MigrationScreen planner={planner} />));
    await act(async () => button("Upload local planner and settings").click());
    expect(planner.migrate).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await act(async () => button("Upload local planner and settings").click());
    expect(planner.migrate).toHaveBeenCalledOnce();
    await act(async () => button("Use remote / cancel migration").click());
    expect(planner.chooseRemote).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
