// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ThemeControls } from "./themes";

it("remembers independent theme selections across mode switches and remounts", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.setItem("hima-appearance", JSON.stringify({ mode: "light", light: "garden", dark: "forest" }));
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const select = async (value: string) => {
    await act(async () => {
      const picker = container.querySelector("select")!;
      picker.value = value;
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  const toggle = async () => { await act(async () => container.querySelector("button")!.click()); };
  try {
    await act(async () => root.render(<ThemeControls />));
    await select("coast");
    await toggle();
    expect([...container.querySelectorAll("option")].map((option) => option.value)).toEqual(["forest", "midnight", "plum"]);
    await select("plum");
    await toggle();
    expect(document.documentElement.dataset.theme).toBe("coast");
    expect(container.querySelector("button")!.getAttribute("aria-pressed")).toBe("false");
    await act(async () => root.render(null));
    await act(async () => root.render(<ThemeControls />));
    await toggle();
    expect(document.documentElement.dataset.mode).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("plum");
    expect(JSON.parse(localStorage.getItem("hima-appearance")!)).toEqual({ mode: "dark", light: "coast", dark: "plum" });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.mode;
    vi.unstubAllGlobals();
  }
});

it("recovers from invalid stored preferences and honors the initial system mode", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  localStorage.setItem("hima-appearance", JSON.stringify({ mode: "invalid", light: "plum", dark: "coast" }));
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ThemeControls />));
    expect(document.documentElement.dataset.mode).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("forest");
  } finally {
    await act(async () => root.unmount());
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.mode;
    vi.unstubAllGlobals();
  }
});
