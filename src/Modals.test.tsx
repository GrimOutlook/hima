// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AdditionModal, EventModal, ModalFrame, SettingsModal } from "./Modals";
import { emptyStore } from "./model";

it("carries selected addition dates between one-time and repeating modes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const save = vi.fn();
  const clickMode = async (label: string) => {
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === label)!.click());
  };
  const submit = async () => {
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  };
  try {
    await act(async () => root.render(<AdditionModal mode="add" poolName="Leave" initialAmount="8"
      initialDate="2026-06-10" onClose={vi.fn()} onSave={save} />));
    await act(async () => container.querySelector<HTMLButtonElement>(".date-picker-trigger")!.click());
    await act(async () => document.querySelector<HTMLButtonElement>('[data-date="2026-06-12"]')!.click());
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    // Clicking the already active mode must preserve all selected dates.
    await clickMode("One-time");
    await submit();
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ date: "2026-06-10", recurring: false,
      additionalEntries: [{ amount: 8, date: "2026-06-12" }] }));
    await clickMode("Repeating");
    await submit();
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ date: "2026-06-10", recurring: true }));
    await act(async () => container.querySelector<HTMLButtonElement>(".date-picker-trigger")!.click());
    await act(async () => document.querySelector<HTMLButtonElement>('[data-date="2026-06-15"]')!.click());
    await clickMode("Repeating");
    await clickMode("One-time");
    await submit();
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ date: "2026-06-15", recurring: false }));
    expect(save.mock.lastCall![0]).not.toHaveProperty("additionalEntries");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("preserves surviving event day and allocation controls when earlier rows are removed", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const pools = [1, 2].map((id) => ({ id, name: `Pool ${id}`, additions: [], recurring: [], caps: [] }));
  const save = vi.fn();
  try {
    await act(async () => root.render(<StrictMode><EventModal editing pools={pools} store={emptyStore()}
      initialName="Trip" initialDays={[
        { date: "2026-01-10", allocations: [{ pool_id: 1, hours: "1" }] },
        { date: "2026-06-10", allocations: [{ pool_id: 1, hours: "2" }, { pool_id: 2, hours: "3" }] },
      ]} onClose={vi.fn()} onSave={save} /></StrictMode>));
    const survivor = container.querySelectorAll<HTMLElement>(".event-day-card")[1];
    const allocation = survivor.querySelectorAll<HTMLElement>(".event-allocation-row")[1];
    const hours = allocation.querySelector("input")!;
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Remove event day"]')!.click());
    expect(container.querySelector(".event-day-card")).toBe(survivor);
    await act(async () => survivor.querySelector<HTMLButtonElement>('[aria-label="Remove pool allocation"]')!.click());
    expect(survivor.querySelector(".event-allocation-row")).toBe(allocation);
    expect(allocation.querySelector("input")).toBe(hours);
    expect(hours.value).toBe("3");
    await act(async () => survivor.querySelector<HTMLButtonElement>('.date-picker-trigger')!.click());
    expect(document.querySelector<HTMLSelectElement>('[aria-label="Choose month"]')!.value).toBe("6");
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(save).toHaveBeenCalledWith("Trip", [{ date: "2026-06-10", allocations: [{ pool_id: 2, hours: 3 }] }]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("contains focus, uses current close handler, and restores the opener on unmount", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const opener = document.createElement("button");
  const container = document.createElement("div");
  document.body.append(opener, container);
  opener.focus();
  const root = createRoot(container);
  const close = vi.fn();
  const updatedClose = vi.fn();
  const render = (onClose: () => void) => <StrictMode><ModalFrame icon="i" title="Information" description="Details" labelledBy="title" onClose={onClose}>
    <button disabled>Disabled</button>
    <button hidden>Hidden</button>
    <a href="#details">Details link</a>
    <textarea aria-label="Notes" />
    <button tabIndex={-1}>Not tabbable</button>
  </ModalFrame></StrictMode>;
  const key = (value: string, shiftKey = false) => {
    const event = new KeyboardEvent("keydown", { key: value, shiftKey, bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(event);
    return event;
  };
  try {
    await act(async () => root.render(render(close)));
    const first = container.querySelector<HTMLButtonElement>(".modal-close")!;
    const last = container.querySelector("textarea")!;
    expect(document.activeElement).toBe(first);
    expect(key("Tab", true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    expect(key("Tab").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    opener.focus();
    expect(document.activeElement).toBe(first);
    last.focus();
    await act(async () => root.render(render(updatedClose)));
    expect(document.activeElement).toBe(last);
    await act(async () => { key("Escape"); });
    expect(close).not.toHaveBeenCalled();
    expect(updatedClose).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    expect(document.activeElement).toBe(opener);
    opener.remove();
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("preserves autofocus and returns from import options before closing Settings", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const opener = document.createElement("button");
  const container = document.createElement("div");
  document.body.append(opener, container);
  opener.focus();
  const root = createRoot(container);
  const close = vi.fn();
  try {
    await act(async () => root.render(<SettingsModal firstDayOfWeek="Monday" onChange={vi.fn()} ignoreWeekends={false}
      onIgnoreWeekendsChange={vi.fn()} defaultTimeline="±6 month" onDefaultTimelineChange={vi.fn()}
      onExport={vi.fn()} onImport={vi.fn()} onClose={close} />));
    expect(document.activeElement).toBe(container.querySelector("select"));
    const importButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Import JSON")!;
    await act(async () => importButton.click());
    expect(container.querySelector("h2")?.textContent).toBe("Import backup");
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(container.querySelector("h2")?.textContent).toBe("Settings");
    expect(close).not.toHaveBeenCalled();
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(close).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    expect(document.activeElement).toBe(opener);
    opener.remove();
    container.remove();
    vi.unstubAllGlobals();
  }
});
