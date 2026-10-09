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
