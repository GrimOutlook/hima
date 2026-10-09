// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ModalFrame, SettingsModal } from "./Modals";

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
