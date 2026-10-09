import { describe, expect, it } from "vitest";
import { chartRangeDates, chartRangeIndices } from "./chartRange";

const history = (...dates: string[]) => dates.map((date) => ({ date }));

describe("manual chart date range", () => {
  it("preserves zoom dates when the timeline grows before and after the selection", () => {
    const original = history("2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08");
    const dates = chartRangeDates(original, { startIndex: 1, endIndex: 2 });
    const extended = history("2026-10-01", ...original.map((point) => point.date), "2026-10-09");
    const indices = chartRangeIndices(extended, dates);
    expect(indices).toEqual({ startIndex: 2, endIndex: 3 });
    expect(chartRangeDates(extended, indices)).toEqual(dates);
  });

  it("remaps a range when dates inside the timeline are removed", () => {
    const dates = { startDate: "2026-10-02", endDate: "2026-10-06" };
    expect(chartRangeIndices(history("2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07"), dates))
      .toEqual({ startIndex: 1, endIndex: 3 });
  });

  it("uses available dates inside the range when weekend endpoints are hidden", () => {
    expect(chartRangeIndices(history("2026-10-02", "2026-10-05", "2026-10-06", "2026-10-09", "2026-10-12"),
      { startDate: "2026-10-03", endDate: "2026-10-11" }))
      .toEqual({ startIndex: 1, endIndex: 3 });
  });

  it("clamps ranges outside a shortened timeline without reversing the handles", () => {
    const shortened = history("2026-10-05", "2026-10-06");
    expect(chartRangeIndices(shortened, { startDate: "2026-10-01", endDate: "2026-10-02" }))
      .toEqual({ startIndex: 0, endIndex: 0 });
    expect(chartRangeIndices(shortened, { startDate: "2026-10-08", endDate: "2026-10-09" }))
      .toEqual({ startIndex: 1, endIndex: 1 });
    expect(chartRangeIndices([], { startDate: "2026-10-08", endDate: "2026-10-09" }))
      .toEqual({ startIndex: 0, endIndex: 0 });
  });
});
