import { describe, expect, it } from "vitest";
import { nextWeekday } from "./settings";

describe("nextWeekday", () => {
  it("advances Saturday and Sunday to Monday across a month boundary", () => {
    expect(nextWeekday("2026-01-31")).toBe("2026-02-02");
    expect(nextWeekday("2026-02-01")).toBe("2026-02-02");
  });

  it("keeps weekdays selected", () => {
    expect(nextWeekday("2026-02-02")).toBe("2026-02-02");
    expect(nextWeekday("2026-02-06")).toBe("2026-02-06");
  });
});
