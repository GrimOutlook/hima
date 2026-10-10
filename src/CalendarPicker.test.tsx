// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CalendarPicker } from "./CalendarPicker";
import { ModalFrame } from "./Modals";
import { IgnoreWeekendsContext } from "./settings";

it.each(["1900-01-01", "2200-12-31"])("keeps month and keyboard navigation within the supported range at %s", async (value) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<CalendarPicker value={value} onChange={vi.fn()} />));
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    const options = [...document.querySelectorAll<HTMLOptionElement>('[aria-label="Choose year"] option')].map((option) => Number(option.value));
    expect(options.every((year) => year >= 1900 && year <= 2200)).toBe(true);
    const lower = value.startsWith("1900");
    expect(document.querySelector<HTMLButtonElement>(`[aria-label="${lower ? "Previous" : "Next"} month"]`)!.disabled).toBe(true);
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: lower ? "ArrowLeft" : "ArrowRight", bubbles: true })));
    expect((document.activeElement as HTMLElement).dataset.date).toBe(value);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("enforces minimum dates and weekends, commits a selection, and clears an optional date", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const change = vi.fn();
  function DateField() {
    const [value, setValue] = useState("2026-06-10");
    return <IgnoreWeekendsContext.Provider value={true}>
      <CalendarPicker label="End date" optional value={value} min="2026-06-10"
        onChange={(date) => { change(date); setValue(date); }} />
    </IgnoreWeekendsContext.Provider>;
  }
  try {
    await act(async () => root.render(<DateField />));
    const trigger = container.querySelector<HTMLButtonElement>(".date-picker-trigger")!;
    await act(async () => trigger.click());
    const day = (date: string) => document.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)!;
    expect(day("2026-06-09").disabled).toBe(true);
    expect(day("2026-06-13").disabled).toBe(true);
    expect(day("2026-06-14").disabled).toBe(true);
    await act(async () => { day("2026-06-09").click(); day("2026-06-13").click(); });
    expect(change).not.toHaveBeenCalled();
    await act(async () => day("2026-06-12").click());
    expect(change).toHaveBeenCalledExactlyOnceWith("2026-06-12");
    expect(document.querySelector(".date-picker-calendar")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await act(async () => trigger.click());
    expect(day("2026-06-12").getAttribute("aria-pressed")).toBe("true");
    await act(async () => Array.from(document.querySelectorAll<HTMLButtonElement>(".date-picker-calendar button"))
      .find((button) => button.textContent === "Clear date")!.click());
    expect(change).toHaveBeenLastCalledWith("");
    expect(trigger.textContent).toBe("Choose date");
    expect(document.querySelector(".date-picker-calendar")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("uses the variant rather than label text for styling and empty-date fallback", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const change = vi.fn();
  try {
    await act(async () => root.render(<CalendarPicker variant="balance" label="Snapshot date" value="2026-01-31" onChange={change} />));
    expect(container.firstElementChild?.className).toBe("date-picker");
    await act(async () => root.render(<CalendarPicker variant="balance" label="Renamed date" value="" onChange={change} />));
    expect(change).toHaveBeenCalledExactlyOnceWith("2026-01-31");
    expect(container.firstElementChild?.className).toBe("date-picker");

    change.mockClear();
    await act(async () => root.render(<CalendarPicker label="BALANCE ON" value="" onChange={change} />));
    expect(change).not.toHaveBeenCalled();
    expect(container.firstElementChild?.className).toBe("date-picker date-picker-field");
    await act(async () => root.render(<CalendarPicker label="Optional date" optional value="" onChange={change} />));
    expect(change).not.toHaveBeenCalled();
    await act(async () => root.render(<CalendarPicker label="Event dates" value="" onChange={change} selectedDates={[]} />));
    expect(change).not.toHaveBeenCalled();
    await act(async () => root.render(<CalendarPicker label="Date" value="invalid" onChange={change} />));
    expect(change).toHaveBeenCalledExactlyOnceWith("2026-01-31");
    await act(async () => root.render(<CalendarPicker variant="balance" label="Snapshot date" display="large-date" value="2026-01-31" onChange={change} />));
    expect(container.firstElementChild?.className).toBe("date-picker date-picker-large");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("navigates dates across months, traps focus, and closes only the nested calendar", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const close = vi.fn();
  const change = vi.fn();
  const key = async (key: string, shiftKey = false) => {
    await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true })); });
  };
  const focused = () => (document.activeElement as HTMLElement).dataset.date;
  try {
    await act(async () => root.render(<ModalFrame icon="i" title="Dates" description="" labelledBy="dates" onClose={close}>
      <CalendarPicker value="2026-01-31" onChange={change} />
    </ModalFrame>));
    const trigger = container.querySelector<HTMLButtonElement>(".date-picker-trigger")!;
    await act(async () => trigger.click());
    expect(focused()).toBe("2026-01-31");
    await key("ArrowRight");
    expect(focused()).toBe("2026-02-01");
    await key("ArrowDown");
    expect(focused()).toBe("2026-02-08");
    await key("ArrowUp");
    await key("ArrowLeft");
    expect(focused()).toBe("2026-01-31");
    await key("PageDown");
    expect(focused()).toBe("2026-02-28");
    await key("Home");
    expect(focused()).toBe("2026-02-23");
    await key("End");
    expect(focused()).toBe("2026-03-01");
    await key("PageUp");
    expect(focused()).toBe("2026-02-01");
    const popup = document.querySelector<HTMLElement>(".date-picker-calendar")!;
    expect(popup.querySelectorAll('[data-date][tabindex="0"]')).toHaveLength(1);
    await key("Tab");
    expect(document.activeElement?.textContent).toBe("Today");
    await key("Tab", true);
    expect(focused()).toBe("2026-02-01");
    await act(async () => container.querySelector<HTMLButtonElement>(".modal-close")!.focus());
    expect(popup.contains(document.activeElement)).toBe(true);
    await key("Escape");
    expect(document.querySelector(".date-picker-calendar")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(close).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

it.each(["pointerup", "pointercancel", "lostpointercapture", "Clear", "Done", "Escape"])("resets multi-date drag previews after %s", async (action) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-10T12:00:00Z"));
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const change = vi.fn();
  function DateField() {
    const [dates, setDates] = useState<string[]>([]);
    return <CalendarPicker value="2026-06-10" onChange={vi.fn()} selectedDates={dates}
      onDatesChange={(next) => { change(next); setDates(next); }} />;
  }
  const pointer = (type: string) => {
    const event = new MouseEvent(type, { bubbles: true, button: 0 });
    Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
    return event;
  };
  try {
    await act(async () => root.render(<DateField />));
    const trigger = container.querySelector<HTMLButtonElement>(".date-picker-trigger")!;
    await act(async () => trigger.click());
    const day = () => document.querySelector<HTMLButtonElement>('[data-date="2026-06-10"]')!;
    day().setPointerCapture = vi.fn();
    await act(async () => day().dispatchEvent(pointer("pointerdown")));
    expect(day().getAttribute("aria-pressed")).toBe("true");
    expect(day().classList.contains("is-selected")).toBe(true);
    expect(change).not.toHaveBeenCalled();

    await act(async () => {
      if (action.startsWith("pointer") || action === "lostpointercapture") day().dispatchEvent(pointer(action));
      else if (action === "Escape") document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      else Array.from(document.querySelectorAll<HTMLButtonElement>(".calendar-footer button"))
        .find((button) => button.textContent === action)!.click();
    });
    if (action === "Done" || action === "Escape") {
      expect(document.querySelector(".date-picker-calendar")).toBeNull();
      expect(document.activeElement).toBe(trigger);
      await act(async () => trigger.click());
    }
    const committed = action === "pointerup";
    expect(day().getAttribute("aria-pressed")).toBe(String(committed));
    expect(day().classList.contains("is-selected")).toBe(committed);
    if (committed) expect(change).toHaveBeenCalledExactlyOnceWith(["2026-06-10"]);
    else if (action === "Clear") expect(change).toHaveBeenCalledExactlyOnceWith([]);
    else expect(change).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
