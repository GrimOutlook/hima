import { describe, expect, it } from "vitest";
import { parseAdditionAmount, validateAdditionDraft, validateCapDraft, validateEventDraft, validatePoolDraft,
  type AdditionDraft } from "./modalValidation";
import type { EventDayInput } from "./model";

describe("pool draft validation", () => {
  const draft = { name: " Leave ", openingAmount: "", openingDate: "2026-06-10" };
  it("accepts blank/zero opening balances and ignores opening fields during edits", () => {
    expect(validatePoolDraft(draft, false)).toBeNull();
    expect(validatePoolDraft({ ...draft, openingAmount: "0" }, false)).toBeNull();
    expect(validatePoolDraft({ ...draft, openingAmount: "invalid", openingDate: "" }, true)).toBeNull();
  });
  it.each([
    [{ name: " " }, "Add a name"],
    [{ openingAmount: "-1" }, "starting balance"],
    [{ openingAmount: "1.234" }, "starting balance"],
    [{ openingDate: "2026-02-30" }, "valid starting date"],
  ])("rejects invalid pool fields %j", (change, error) => {
    expect(validatePoolDraft({ ...draft, ...change }, false)).toContain(error);
  });
});

describe("cap draft validation", () => {
  const draft = { amount: "0", date: "2026-06-10", endDate: "" };
  it("accepts ongoing caps and inclusive end dates", () => {
    expect(validateCapDraft(draft)).toBeNull();
    expect(validateCapDraft({ ...draft, endDate: draft.date })).toBeNull();
  });
  it.each([
    [{ amount: " " }, "maximum balance"],
    [{ amount: "-1" }, "maximum balance"],
    [{ amount: "1.234" }, "maximum balance"],
    [{ date: "" }, "valid start date"],
    [{ endDate: "2026-02-30" }, "valid start date"],
    [{ endDate: "2026-06-09" }, "on or after"],
  ])("rejects invalid cap fields %j", (change, error) => {
    expect(validateCapDraft({ ...draft, ...change })).toContain(error);
  });
});

describe("addition draft validation", () => {
  const draft: AdditionDraft = { amount: "7.6", date: "2026-06-10", endDate: "", reset: false,
    recurring: false, cadence: "Fortnightly", month: 6, nthWeekday: "First", weekday: "Friday",
    batchAdding: false, selectedDates: [] };
  it("accepts single/batch additions, schedules and blank/zero resets", () => {
    expect(validateAdditionDraft(draft)).toBeNull();
    expect(validateAdditionDraft({ ...draft, batchAdding: true, date: "", selectedDates: [draft.date, "2026-06-12"] })).toBeNull();
    expect(validateAdditionDraft({ ...draft, recurring: true, cadence: "YearlyNthWeekday", endDate: draft.date })).toBeNull();
    for (const amount of ["", " ", "0"]) {
      expect(validateAdditionDraft({ ...draft, amount, reset: true })).toBeNull();
      expect(parseAdditionAmount(amount, true)).toBe(0);
    }
    // Stale recurring fields do not block a one-time addition.
    expect(validateAdditionDraft({ ...draft, endDate: "invalid", month: 0 })).toBeNull();
  });
  it.each<[Partial<AdditionDraft>, string]>([
    [{ amount: "0" }, "greater than zero"],
    [{ amount: "1.234" }, "greater than zero"],
    [{ reset: true, amount: "-1" }, "reset balance"],
    [{ date: "" }, "valid date"],
    [{ recurring: true, cadence: "YearlyNthWeekday", month: 0 }, "valid occurrence"],
    [{ recurring: true, cadence: "YearlyNthWeekday", month: 13 }, "valid occurrence"],
    [{ recurring: true, cadence: "YearlyNthWeekday", month: 1.5 }, "valid occurrence"],
    [{ recurring: true, endDate: "invalid" }, "valid end date"],
    [{ recurring: true, endDate: "2026-06-09" }, "on or after"],
    [{ batchAdding: true }, "at least one valid date"],
    [{ batchAdding: true, selectedDates: ["2026-02-30"] }, "at least one valid date"],
  ])("rejects invalid addition fields %j", (change, error) => {
    expect(validateAdditionDraft({ ...draft, ...change })).toContain(error);
  });
});

describe("event draft validation", () => {
  const pools = [{ id: 1 }, { id: 2 }];
  const day: EventDayInput = { date: "2026-06-10", allocations: [{ pool_id: 1, hours: "7.6" }] };
  it("validates names and required dates before checking allocations", () => {
    expect(validateEventDraft(" ", [], pools, false)).toBe("Give this event a name.");
    expect(validateEventDraft("Trip", [], pools, false)).toBe("Add at least one day to this event.");
    expect(validateEventDraft("Trip", [{ ...day, allocations: [{ pool_id: 1, hours: "" }] }], pools, false)).toBeNull();
    expect(validateEventDraft(" Trip ", [day, { ...day, date: "2026-06-11" }], pools)).toBeNull();
    expect(validateEventDraft("Trip", [{ ...day, allocations: [...day.allocations, { pool_id: 2, hours: "0.01" }] }], pools)).toBeNull();
  });
  it.each<[EventDayInput[], string]>([
    [[{ ...day, date: "2026-02-30" }], "valid date"],
    [[day, day], "different date"],
    [[{ ...day, allocations: [] }], "at least one pool"],
    [[{ ...day, allocations: [...day.allocations, ...day.allocations] }], "only once"],
    [[{ ...day, allocations: [{ pool_id: 3, hours: "1" }] }], "existing pool"],
    [[{ ...day, allocations: [{ pool_id: 1, hours: "0" }] }], "positive hours"],
    [[{ ...day, allocations: [{ pool_id: 1, hours: "1.234" }] }], "positive hours"],
  ])("rejects invalid event days %j", (days, error) => {
    expect(validateEventDraft("Trip", days, pools)).toContain(error);
  });
  it("preserves the first error and leaves the caller's draft untouched", () => {
    const days = structuredClone([day, day]);
    const original = structuredClone(days);
    expect(validateEventDraft("", days, pools)).toBe("Give this event a name.");
    expect(days).toEqual(original);
  });
});
