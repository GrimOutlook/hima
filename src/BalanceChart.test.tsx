// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { BalanceChart } from "./BalanceChart";
import { TIMELINE_PRESETS, type TimelinePreset } from "./settings";

vi.mock("recharts", async (importOriginal) => ({
  ...await importOriginal<typeof import("recharts")>(),
  ResponsiveContainer: () => null,
}));

it.each<[TimelinePreset, string, string]>([
  ["all time", "Jan 01, 2020", "Jan 01, 2032"],
  ["±6 month", "Apr 09, 2026", "Apr 09, 2027"],
  ["YTD", "Jan 01, 2026", "Oct 09, 2026"],
  ["6 month", "Apr 09, 2026", "Oct 09, 2026"],
  ["3 month", "Jul 09, 2026", "Oct 09, 2026"],
  ["1 year", "Oct 09, 2025", "Oct 09, 2026"],
  ["5 year", "Oct 09, 2021", "Oct 09, 2026"],
  ["Previous Year", "Jan 01, 2025", "Dec 31, 2025"],
  ["YFD", "Oct 09, 2026", "Dec 31, 2026"],
  ["future 6 month", "Oct 09, 2026", "Apr 09, 2027"],
  ["future 3 month", "Oct 09, 2026", "Jan 09, 2027"],
  ["future 1 year", "Oct 09, 2026", "Oct 09, 2027"],
  ["future 5 year", "Oct 09, 2026", "Oct 09, 2031"],
  ["Next Year", "Jan 01, 2027", "Dec 31, 2027"],
])("preserves the %s preset range and semantic menu grouping", async (preset, start, end) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<BalanceChart
      defaultTimeline={preset}
      historyDates={["2020-01-01", "2021-10-09", "2025-01-01", "2025-10-09", "2025-12-31",
        "2026-01-01", "2026-04-09", "2026-07-09", "2026-10-09", "2026-12-31",
        "2027-01-01", "2027-01-09", "2027-04-09", "2027-10-09", "2027-12-31", "2031-10-09", "2032-01-01"]}
      today="2026-10-09" selectedDate="2026-10-09" onDateChange={vi.fn()} onToday={vi.fn()}
      pools={[]} poolHistories={{}} onPoolVisibilityChange={vi.fn()}
    />));
    expect(container.querySelector(".history-range")?.textContent).toContain(`${start} – ${end}`);
    const buttons = container.querySelectorAll(".history-timeline-buttons button");
    expect(buttons).toHaveLength(TIMELINE_PRESETS.length);
    const active = container.querySelector('[aria-pressed="true"]')!;
    const group = preset === "all time" || preset === "±6 month" ? "General"
      : preset.startsWith("future ") || preset === "YFD" || preset === "Next Year" ? "Future" : "Past";
    expect(active.closest(".history-timeline-group")?.getAttribute("aria-label")).toBe(group);
    const trigger = container.querySelector<HTMLButtonElement>(".history-timeline-trigger")!;
    await act(async () => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    await act(async () => active.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

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
