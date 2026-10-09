// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import App from "./App";
import { emptyStore, STORAGE_KEY } from "./model";

vi.mock("./BalanceChart", () => ({ BalanceChart: () => null }));

it("keeps pool actions outside the reorder button and activates keyboard dragging only on the handle", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const pool = (id: number, name: string) => ({ id, name, additions: [], recurring: [], caps: [] });
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyStore(), pools: [pool(1, "Vacation"), pool(2, "Holiday")], next_id: 3 }));
  const key = async (target: HTMLElement, code: string) => {
    await act(async () => target.dispatchEvent(new KeyboardEvent("keydown", { key: code === "Space" ? " " : code, code, bubbles: true, cancelable: true })));
  };
  try {
    await act(async () => root.render(<App />));
    const card = container.querySelector("article.pool-card")!;
    expect(card.hasAttribute("role")).toBe(false);
    expect(card.hasAttribute("tabindex")).toBe(false);
    const handle = card.querySelector<HTMLButtonElement>('[aria-label="Reorder Vacation"]')!;
    expect(handle.tagName).toBe("BUTTON");
    expect(handle.querySelector("button")).toBeNull();
    expect(handle.getAttribute("aria-describedby")).toBeTruthy();
    const select = card.querySelector<HTMLButtonElement>(".pool-select-button")!;
    await key(select, "Space");
    expect(container.querySelector(".pool-card-dragging")).toBeNull();
    await act(async () => select.click());
    expect(select.getAttribute("aria-pressed")).toBe("true");
    await act(async () => handle.focus());
    await key(handle, "Space");
    expect(handle.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector(".pool-card-dragging")).not.toBeNull();
    await key(handle, "Escape");
    expect(handle.getAttribute("aria-pressed")).not.toBe("true");
    await act(async () => card.querySelector<HTMLButtonElement>('[aria-label="View information for Vacation"]')!.click());
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Vacation information");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
  }
});

it("does not offer reordering for a single pool", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyStore(), pools: [{ id: 1, name: "Vacation", additions: [], recurring: [], caps: [] }], next_id: 2 }));
  try {
    await act(async () => root.render(<App />));
    expect(container.querySelector(".pool-drag-handle")).toBeNull();
    expect(container.querySelector("article")?.hasAttribute("tabindex")).toBe(false);
  } finally {
    await act(async () => root.unmount());
    localStorage.clear();
    vi.unstubAllGlobals();
  }
});
