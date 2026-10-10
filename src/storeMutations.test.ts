import { describe, expect, it } from "vitest";
import { emptyStore, reduceStore, storeActionError, type AdditionFormData, type Store, type StoreAction } from "./model";
import { validateDocument } from "./plannerPersistence";

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function fixture(): Store {
  return freeze({
    ...emptyStore(), next_id: 2,
    pools: [
      { id: 1, name: "Leave", new_additions_expire_same_day: true,
        additions: [{ id: 3, amount: 8, date: "2026-01-01" }],
        recurring: [{ id: 4, amount: 2, cadence: "YearlyNthWeekday", start_date: "2026-01-01", end_date: "2027-12-31", month: 5, nth_weekday: "Last", weekday: "Monday" }],
        caps: [{ id: 5, max_balance: 40, start_date: "2026-01-01", end_date: "2026-06-30" }] },
      { id: 2, name: "Other", additions: [], recurring: [], caps: [] },
    ],
    events: [
      { id: 6, name: "Mixed", days: [
        { date: "2026-02-01", allocations: [{ pool_id: 1, hours: 2 }, { pool_id: 2, hours: 3 }] },
        { date: "2026-02-02", allocations: [{ pool_id: 1, hours: 8 }] },
        { date: "2026-02-03", allocations: [{ pool_id: 2, hours: 4 }] },
      ] },
      { id: 7, name: "Only leave", days: [{ date: "2026-03-01", allocations: [{ pool_id: 1, hours: 1 }] }] },
    ],
  });
}

const poolAction: StoreAction & { type: "save-pool" } = {
  type: "save-pool", name: "New", openingAmount: "12.25", openingDate: "2026-04-01",
  hiddenFromGraph: false, hiddenFromTotal: true, newAdditionsExpireSameDay: true,
};
const form: AdditionFormData = { amount: 1.25, date: "2026-04-01", recurring: false, reset: false, cadence: "Monthly" };

describe("pure store mutations", () => {
  it("keeps ordinary pool and addition edits valid before JSON serialization", () => {
    let store = emptyStore();
    const apply = (action: StoreAction) => {
      store = reduceStore(store, action);
      expect(() => validateDocument(store)).not.toThrow();
    };
    apply({ ...poolAction, newAdditionsExpireSameDay: false });
    const poolId = store.pools[0]!.id;
    expect(store.pools[0]).not.toHaveProperty("new_additions_expire_same_day");
    expect(store.pools[0]!.additions[0]).not.toHaveProperty("expires_same_day");
    apply({ ...poolAction, poolId, newAdditionsExpireSameDay: true, color: "#123456" });
    apply({ ...poolAction, poolId, newAdditionsExpireSameDay: false });
    expect(store.pools[0]).not.toHaveProperty("color");
    expect(store.pools[0]).not.toHaveProperty("new_additions_expire_same_day");
    apply({ type: "save-addition", poolId, form });
    const additionId = store.pools[0]!.additions[1]!.id;
    apply({ type: "save-addition", poolId, target: { type: "one-time", id: additionId }, form: { ...form, reset: true } });
    apply({ type: "save-addition", poolId, target: { type: "one-time", id: additionId }, form });
    expect(store.pools[0]!.additions[1]).not.toHaveProperty("reset");
    apply({ type: "save-addition", poolId, form: { ...form, recurring: true, cadence: "YearlyNthWeekday", month: 5, nthWeekday: "Last", weekday: "Monday", endDate: "2029-12-31" } });
    const recurringId = store.pools[0]!.recurring[0]!.id;
    apply({ type: "save-addition", poolId, target: { type: "recurring", id: recurringId }, form: { ...form, recurring: true, cadence: "Weekly" } });
    for (const field of ["end_date", "month", "nth_weekday", "weekday", "reset", "expires_same_day"]) {
      expect(store.pools[0]!.recurring[0]).not.toHaveProperty(field);
    }
  });

  it("allocates collision-free IDs for a pool and its optional opening balance", () => {
    const store = fixture();
    const result = reduceStore(store, poolAction);
    expect(result.next_id).toBe(10);
    expect(result.pools[2]).toMatchObject({ id: 8, name: "New", hidden_from_total: true,
      additions: [{ id: 9, amount: 12.25, date: "2026-04-01", expires_same_day: true }], recurring: [], caps: [] });
    expect(result.events).toBe(store.events);
    for (const openingAmount of ["", "0"]) {
      const empty = reduceStore(store, { ...poolAction, openingAmount });
      expect(empty.next_id).toBe(9);
      expect(empty.pools[2]?.additions).toEqual([]);
    }
  });

  it("edits pool settings without changing its ledger or allocating IDs", () => {
    const store = fixture();
    const result = reduceStore(store, { ...poolAction, poolId: 1, color: "#123456", newAdditionsExpireSameDay: false, openingAmount: "ignored" });
    expect(result.pools[0]).toMatchObject({ name: "New", color: "#123456", hidden_from_total: true });
    expect(result.pools[0]!.new_additions_expire_same_day).toBeUndefined();
    expect(result.pools[0]!.additions).toBe(store.pools[0]!.additions);
    expect(result.pools[0]!.recurring).toBe(store.pools[0]!.recurring);
    expect(result.pools[0]!.caps).toBe(store.pools[0]!.caps);
    expect(result.pools[1]).toBe(store.pools[1]);
    expect(result.next_id).toBe(store.next_id);
  });

  it("adds a batch of one-time credits with consecutive IDs and pool expiry defaults", () => {
    const store = fixture();
    const result = reduceStore(store, { type: "save-addition", poolId: 1, form: { ...form, additionalEntries: [{ amount: 3, date: "2026-04-02" }] } });
    expect(result.pools[0]?.additions.slice(1)).toEqual([
      { id: 8, amount: 1.25, date: "2026-04-01", reset: undefined, expires_same_day: true },
      { id: 9, amount: 3, date: "2026-04-02", reset: undefined, expires_same_day: true },
    ]);
    expect(result.next_id).toBe(10);
    expect(result.pools[1]).toBe(store.pools[1]);
  });

  it.each([false, true])("creates recurring schedules (reset=%s) without batching or expiring resets", (reset) => {
    const result = reduceStore(fixture(), { type: "save-addition", poolId: 1, form: {
      ...form, reset, recurring: true, cadence: "YearlyNthWeekday", month: 11, nthWeekday: "Fourth", weekday: "Thursday",
      endDate: "2029-12-31", additionalEntries: [{ amount: 100, date: "2026-04-02" }],
    } });
    expect(result.pools[0]?.recurring[1]).toEqual({ id: 8, amount: 1.25, start_date: "2026-04-01", end_date: "2029-12-31",
      cadence: "YearlyNthWeekday", month: 11, nth_weekday: "Fourth", weekday: "Thursday", reset: reset || undefined, expires_same_day: reset ? undefined : true });
    expect(result.next_id).toBe(9);
    expect(result.pools[0]?.additions).toHaveLength(1);
  });

  it("ignores batch rows for a one-time reset and allows a zero balance", () => {
    const result = reduceStore(fixture(), { type: "save-addition", poolId: 1, form: { ...form, reset: true, amount: 0, additionalEntries: [{ amount: 8, date: "2026-04-02" }] } });
    expect(result.next_id).toBe(9);
    expect(result.pools[0]?.additions[1]).toMatchObject({ id: 8, reset: true, amount: 0 });
    expect(result.pools[0]!.additions[1]!.expires_same_day).toBeUndefined();
  });

  it("edits one-time credits in place and uses the explicit expiry setting", () => {
    const store = fixture();
    const action: StoreAction = { type: "save-addition", poolId: 1, target: { type: "one-time", id: 3 }, form };
    const result = reduceStore(store, action);
    expect(result.pools[0]?.additions).toEqual([{ id: 3, amount: 1.25, date: "2026-04-01", reset: undefined, expires_same_day: undefined }]);
    expect(result.next_id).toBe(store.next_id);
    const expiring = reduceStore(store, { ...action, form: { ...form, expiresSameDay: true } });
    expect(expiring.pools[0]?.additions[0]?.expires_same_day).toBe(true);
    const reset = reduceStore(expiring, { ...action, form: { ...form, reset: true, expiresSameDay: true } });
    expect(reset.pools[0]!.additions[0]!.expires_same_day).toBeUndefined();
  });

  it("clears obsolete recurring schedule fields when changing cadence", () => {
    const store = fixture();
    const result = reduceStore(store, { type: "save-addition", poolId: 1, target: { type: "recurring", id: 4 }, form: { ...form, recurring: true, cadence: "Weekly", expiresSameDay: true } });
    expect(result.pools[0]?.recurring[0]).toEqual({ id: 4, amount: 1.25, cadence: "Weekly", start_date: "2026-04-01", end_date: undefined,
      month: undefined, nth_weekday: undefined, weekday: undefined, reset: undefined, expires_same_day: true });
    expect(result.next_id).toBe(store.next_id);
  });

  it("creates and edits caps, excluding the edited cap from overlap validation", () => {
    const store = fixture();
    const cap = { max_balance: 20, start_date: "2026-07-01" };
    const created = reduceStore(store, { type: "save-cap", poolId: 1, cap });
    expect(created.pools[0]?.caps[1]).toEqual({ ...cap, id: 8 });
    expect(created.next_id).toBe(9);
    const edited = reduceStore(store, { type: "save-cap", poolId: 1, capId: 5, cap: { ...cap, start_date: "2026-01-01" } });
    expect(edited.pools[0]?.caps).toEqual([{ ...cap, start_date: "2026-01-01", id: 5 }]);
    expect(edited.next_id).toBe(store.next_id);
    const conflict: StoreAction = { type: "save-cap", poolId: 1, cap: { ...cap, start_date: "2026-06-30" } };
    expect(storeActionError(store, conflict)).toBe("Cap date ranges must not overlap.");
    expect(reduceStore(store, conflict)).toBe(store);
    // An action valid before another queued save must be revalidated afterward.
    expect(reduceStore(created, { type: "save-cap", poolId: 1, cap })).toBe(created);
  });

  it("creates and edits events without replacing unrelated events", () => {
    const store = fixture();
    const days = [{ date: "2026-05-01", allocations: [{ pool_id: 2, hours: 4 }] }];
    const created = reduceStore(store, { type: "save-event", name: "Trip", days });
    expect(created.events[2]).toEqual({ id: 8, name: "Trip", days });
    expect(created.next_id).toBe(9);
    const edited = reduceStore(store, { type: "save-event", eventId: 6, name: "Trip", days });
    expect(edited.events[0]).toEqual({ id: 6, name: "Trip", days });
    expect(edited.events[1]).toBe(store.events[1]);
    expect(edited.next_id).toBe(store.next_id);
  });

  it("removes a pool's allocations, empty days, and empty events while preserving shared leave", () => {
    const result = reduceStore(fixture(), { type: "remove-pool", poolId: 1 });
    expect(result.pools.map((pool) => pool.id)).toEqual([2]);
    expect(result.events).toEqual([{ id: 6, name: "Mixed", days: [
      { date: "2026-02-01", allocations: [{ pool_id: 2, hours: 3 }] },
      { date: "2026-02-03", allocations: [{ pool_id: 2, hours: 4 }] },
    ] }]);
    expect(result.next_id).toBe(2);
  });

  it("deletes only the selected addition, recurring rule, cap, or event", () => {
    const store = fixture();
    const oneTime = reduceStore(store, { type: "remove-addition", poolId: 1, additionId: 3, recurring: false });
    expect(oneTime.pools[0]?.additions).toEqual([]);
    expect(oneTime.pools[0]!.recurring).toBe(store.pools[0]!.recurring);
    const recurring = reduceStore(store, { type: "remove-addition", poolId: 1, additionId: 4, recurring: true });
    expect(recurring.pools[0]?.recurring).toEqual([]);
    expect(recurring.pools[0]!.additions).toBe(store.pools[0]!.additions);
    const cap = reduceStore(store, { type: "remove-cap", poolId: 1, capId: 5 });
    expect(cap.pools[0]?.caps).toEqual([]);
    expect(cap.events).toBe(store.events);
    expect(reduceStore(store, { type: "remove-event", eventId: 6 }).events).toEqual([store.events[1]]);
  });

  it("reorders pools and toggles graph visibility without changing ledger data", () => {
    const store = fixture();
    const reordered = reduceStore(store, { type: "reorder-pool", poolId: 1, targetId: 2 });
    expect(reordered.pools).toEqual([store.pools[1], store.pools[0]]);
    expect(reduceStore(reordered, { type: "reorder-pool", poolId: 1, targetId: 2 }).pools).toEqual(store.pools);
    expect(reduceStore(store, { type: "reorder-pool", poolId: 1, targetId: 1 })).toBe(store);
    expect(reduceStore(store, { type: "reorder-pool", poolId: 1, targetId: 99 })).toBe(store);
    const hidden = reduceStore(store, { type: "set-pool-visibility", poolId: 1, visible: false });
    expect(hidden.pools[0]?.hidden_from_graph).toBe(true);
    expect(hidden.pools[0]!.additions).toBe(store.pools[0]!.additions);
    expect(hidden.events).toBe(store.events);
    expect(reduceStore(hidden, { type: "set-pool-visibility", poolId: 1, visible: true }).pools[0]?.hidden_from_graph).toBe(false);
  });

  it.each([
    [{ ...poolAction, openingAmount: "1.234" }, "Enter a starting balance with up to two decimal places."],
    [{ ...poolAction, poolId: 99 }, "This pool no longer exists."],
    [{ type: "save-cap", poolId: 99, cap: { max_balance: 10, start_date: "2026-01-01" } }, "This pool no longer exists."],
    [{ type: "save-cap", poolId: 1, capId: 99, cap: { max_balance: 10, start_date: "2026-01-01" } }, "This cap no longer exists."],
    [{ type: "save-addition", poolId: 99, form }, "This pool no longer exists."],
    [{ type: "save-addition", poolId: 1, target: { type: "one-time", id: 99 }, form }, "This addition no longer exists."],
    [{ type: "save-addition", poolId: 1, target: { type: "recurring", id: 99 }, form }, "This addition no longer exists."],
    [{ type: "save-event", eventId: 99, name: "Missing", days: [] }, "This event no longer exists."],
  ] satisfies [StoreAction, string][])("rejects invalid or stale saves: %j", (action, error) => {
    const store = fixture();
    expect(storeActionError(store, action)).toBe(error);
    expect(reduceStore(store, action)).toBe(store);
  });
});
