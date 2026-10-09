// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CalendarPicker } from "./CalendarPicker";
import { ModalFrame } from "./Modals";

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
