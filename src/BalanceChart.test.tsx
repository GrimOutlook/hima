// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { BalanceChart } from "./BalanceChart";

vi.mock("recharts", async (importOriginal) => ({
  ...await importOriginal<typeof import("recharts")>(),
  ResponsiveContainer: () => null,
}));

it("restores the configured timeline and selects today with the visible reset button", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const onToday = vi.fn();
  try {
    await act(async () => root.render(<BalanceChart
      defaultTimeline="YTD" historyDates={["2025-01-01", "2026-01-01", "2026-10-09", "2027-01-01"]}
      today="2026-10-09" selectedDate="2026-10-09" onDateChange={vi.fn()} onToday={onToday}
      pools={[]} poolHistories={{}} onPoolVisibilityChange={vi.fn()}
    />));
    const all = container.querySelector<HTMLButtonElement>('[title="Show the entire available timeline"]')!;
    const ytd = container.querySelector<HTMLButtonElement>('[title="Show January 1 of this year through today"]')!;
    await act(async () => all.click());
    expect(all.getAttribute("aria-pressed")).toBe("true");
    const reset = [...container.querySelectorAll("button")].find((button) => button.textContent === "Reset timeline")!;
    await act(async () => reset.click());
    expect(onToday).toHaveBeenCalledOnce();
    expect(ytd.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector(".history-range")?.textContent).toContain("Jan 01, 2026 – Oct 09, 2026");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("recomputes a widened event range when history dates change without changing event indices", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = (historyDates: string[], eventDate: string) => root.render(<BalanceChart
    defaultTimeline="all time" historyDates={historyDates}
    today="2026-10-09" selectedDate="2026-10-09" onDateChange={vi.fn()} onToday={vi.fn()}
    pools={[]} poolHistories={{}} onPoolVisibilityChange={vi.fn()}
    zoomEvent={{ id: 1, name: "Trip", days: [{ date: eventDate, allocations: [] }] }}
    eventSelectionRequest={1} widenSelectedEvent
  />);
  try {
    await act(async () => render(
      ["2025-01-01", "2026-04-01", "2026-10-01", "2027-04-01", "2028-01-01"], "2026-10-01",
    ));
    expect(container.querySelector(".history-range")?.textContent).toContain("Apr 01, 2026 – Apr 01, 2027");
    await act(async () => render(
      ["2025-01-01", "2026-01-01", "2026-04-01", "2027-01-01", "2028-01-01"], "2026-04-01",
    ));
    expect(container.querySelector(".history-range")?.textContent).toContain("Jan 01, 2026 – Jan 01, 2027");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("handles an empty timeline and an event outside the available history", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<BalanceChart
      defaultTimeline="all time" historyDates={[]}
      today="2026-10-09" selectedDate="2026-10-09" onDateChange={vi.fn()} onToday={vi.fn()}
      pools={[]} poolHistories={{}} onPoolVisibilityChange={vi.fn()}
      zoomEvent={{ id: 1, name: "Trip", days: [{ date: "2029-01-01", allocations: [] }] }}
      eventSelectionRequest={1} widenSelectedEvent
    />));
    expect(container.querySelector(".history-range")?.textContent).toContain("Oct 09, 2026");
    expect(container.textContent).not.toContain("NaN");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("keeps every preset in its semantic group and preserves date boundaries on sparse history", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const cases = [
    ["General", "Show the entire available timeline", "Jan 01, 2025 – Jan 01, 2028"],
    ["General", "Show one year centered on today: six months before and six months after", "May 01, 2026 – May 01, 2027"],
    ["Past", "Show January 1 of this year through today", "Jan 01, 2026 – Oct 09, 2026"],
    ["Past", "Show the past six months through today", "May 01, 2026 – Oct 09, 2026"],
    ["Past", "Show the past three months through today", "Aug 01, 2026 – Oct 09, 2026"],
    ["Past", "Show the past year through today", "Jan 01, 2026 – Oct 09, 2026"],
    ["Past", "Show the past five years through today", "Jan 01, 2025 – Oct 09, 2026"],
    ["Past", "Show January 1 through December 31 of last year", "Jan 01, 2025 – Jan 01, 2026"],
    ["Future", "Show today through December 31 of this year", "Oct 09, 2026 – Jan 01, 2027"],
    ["Future", "Show today through six months from now", "Oct 09, 2026 – May 01, 2027"],
    ["Future", "Show today through three months from now", "Oct 09, 2026 – Feb 01, 2027"],
    ["Future", "Show today through one year from now", "Oct 09, 2026 – Nov 01, 2027"],
    ["Future", "Show today through five years from now", "Oct 09, 2026 – Jan 01, 2028"],
    ["Future", "Show January 1 through December 31 of next year", "Jan 01, 2027 – Jan 01, 2028"],
  ];
  try {
    await act(async () => root.render(<BalanceChart
      defaultTimeline="all time" historyDates={["2025-01-01", "2026-01-01", "2026-05-01", "2026-08-01",
        "2026-10-09", "2027-01-01", "2027-02-01", "2027-05-01", "2027-11-01", "2028-01-01"]}
      today="2026-10-09" selectedDate="2026-10-09" onDateChange={vi.fn()} onToday={vi.fn()}
      pools={[]} poolHistories={{}} onPoolVisibilityChange={vi.fn()}
    />));
    expect(container.querySelectorAll(".history-timeline-buttons button")).toHaveLength(cases.length);
    for (const [group, title, range] of cases) {
      const button = [...container.querySelectorAll<HTMLButtonElement>(".history-timeline-buttons button")]
        .find((button) => button.title === title)!;
      expect(button.closest(".history-timeline-group")?.getAttribute("aria-label")).toBe(group);
      await act(async () => button.click());
      expect(button.getAttribute("aria-pressed")).toBe("true");
      expect(container.querySelector(".history-range")?.textContent).toContain(range);
    }
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("closes both dropdowns on Escape and external blur but keeps internal focus open", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<BalanceChart
      defaultTimeline="all time" historyDates={["2026-10-09"]}
      today="2026-10-09" selectedDate="2026-10-09" onDateChange={vi.fn()} onToday={vi.fn()}
      pools={[{ id: 1, name: "Leave", color: "#123456", additions: [], recurring: [], caps: [] }]}
      poolHistories={{}} onPoolVisibilityChange={vi.fn()}
    />));
    for (const selector of [".history-pool-dropdown", ".history-timeline-dropdown"]) {
      const dropdown = container.querySelector(selector)!;
      const trigger = dropdown.querySelector<HTMLButtonElement>("button")!;
      const child = dropdown.querySelector("input, .history-timeline-buttons button")!;
      await act(async () => trigger.click());
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      await act(async () => trigger.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: child })));
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      await act(async () => child.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      await act(async () => trigger.click());
      await act(async () => child.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null })));
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
    }
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
