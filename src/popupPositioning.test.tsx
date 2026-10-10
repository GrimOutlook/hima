// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CalendarPicker } from "./CalendarPicker";
import { SettingTooltip } from "./SettingTooltip";

it.each(["calendar", "tooltip"])("positions the %s, follows resize and ancestor scroll, and cleans up on close", async (kind) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("innerWidth", 800);
  vi.stubGlobal("innerHeight", 900);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let anchorTop = 300;
  const measure = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const tooltip = this.classList.contains("setting-tooltip-content");
    return { x: 400, y: anchorTop, left: 400, right: tooltip ? 600 : 500,
      top: anchorTop, bottom: anchorTop + 30, width: tooltip ? 200 : 100,
      height: tooltip ? 100 : 30, toJSON: () => ({}) };
  });
  const isCalendar = kind === "calendar";
  const popup = () => document.querySelector<HTMLElement>(isCalendar ? ".date-picker-calendar" : '[role="tooltip"]')!;
  try {
    await act(async () => root.render(<StrictMode>{isCalendar
      ? <CalendarPicker value="2026-06-10" onChange={vi.fn()} />
      : <SettingTooltip id="help" label="Help">Helpful setting explanation</SettingTooltip>}
    </StrictMode>));
    const trigger = container.querySelector<HTMLButtonElement>("button")!;
    await act(async () => { if (isCalendar) trigger.click(); else trigger.focus(); });
    expect(popup().style.left).toBe(isCalendar ? "188px" : "300px");
    expect(popup().style.top).toBe(isCalendar ? "338px" : "194px");

    anchorTop = 700;
    await act(async () => container.dispatchEvent(new Event("scroll")));
    expect(popup().style.top).toBe(isCalendar ? "262px" : "594px");

    anchorTop = 2;
    vi.stubGlobal("innerWidth", 250);
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(popup().style.left).toBe(isCalendar ? "8px" : "42px");
    expect(popup().style.top).toBe(isCalendar ? "40px" : "38px");
    if (isCalendar) expect(popup().style.width).toBe("234px");
    else expect(popup().style.width).toBe("");

    // Tooltips additionally keep their measured height inside the viewport.
    if (!isCalendar) {
      vi.stubGlobal("innerHeight", 120);
      await act(async () => window.dispatchEvent(new Event("resize")));
      expect(popup().style.top).toBe("12px");
    }

    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(popup()).toBeNull();
    measure.mockClear();
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
      container.dispatchEvent(new Event("scroll"));
    });
    expect(measure).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    measure.mockRestore();
    vi.unstubAllGlobals();
  }
});
