import { parseHours } from "./hours";
import { allocateIds, capRangesOverlap } from "./store";
import type { Pool, RecurringAddition, Store, StoreAction } from "./types";

export function storeActionError(store: Store, action: StoreAction): string | null {
  if (action.type === "save-pool") {
    if (action.poolId !== undefined) return store.pools.some((pool) => pool.id === action.poolId) ? null : "This pool no longer exists.";
    return action.openingAmount.trim() !== "" && parseHours(action.openingAmount, true) === null
      ? "Enter a starting balance with up to two decimal places." : null;
  }
  if (action.type === "save-event") {
    return action.eventId !== undefined && !store.events.some((event) => event.id === action.eventId)
      ? "This event no longer exists." : null;
  }
  if (action.type === "save-cap" || action.type === "save-addition") {
    const pool = store.pools.find((pool) => pool.id === action.poolId);
    if (!pool) return "This pool no longer exists.";
    if (action.type === "save-cap") {
      if (action.capId !== undefined && !pool.caps.some((cap) => cap.id === action.capId)) return "This cap no longer exists.";
      if (capRangesOverlap([...pool.caps.filter((cap) => cap.id !== action.capId), action.cap])) return "Cap date ranges must not overlap.";
    } else if (action.target && !(action.target.type === "one-time" ? pool.additions : pool.recurring)
      .some((entry) => entry.id === action.target!.id)) {
      return "This addition no longer exists.";
    }
  }
  return null;
}

// Optional fields must be absent, not undefined: the controller validates edits
// before JSON serialization, which would otherwise silently omit these fields.
function definedFields<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

// Revalidate against the current store so queued updates cannot resurrect deleted
// entries or introduce overlapping caps. Invalid actions leave the store intact.
export function reduceStore(store: Store, action: StoreAction): Store {
  if (storeActionError(store, action)) return store;
  const updatePool = (poolId: number, update: (pool: Pool) => Pool): Store => ({
    ...store, pools: store.pools.map((pool) => pool.id === poolId ? update(pool) : pool),
  });
  switch (action.type) {
    case "save-pool": {
      const settings = {
        name: action.name,
        hidden_from_graph: action.hiddenFromGraph,
        hidden_from_total: action.hiddenFromTotal,
        new_additions_expire_same_day: action.newAdditionsExpireSameDay || undefined,
      };
      if (action.poolId !== undefined) {
        return updatePool(action.poolId, (pool) => definedFields({ ...pool, ...settings, color: action.color }));
      }
      const amount = action.openingAmount.trim() === "" ? 0 : parseHours(action.openingAmount, true)!;
      const ids = allocateIds(store, amount > 0 ? 2 : 1);
      const pool: Pool = {
        id: ids.firstId,
        ...definedFields(settings),
        additions: amount > 0 ? [definedFields({
          id: ids.firstId + 1, amount, date: action.openingDate,
          expires_same_day: action.newAdditionsExpireSameDay || undefined,
        })] : [],
        recurring: [],
        caps: [],
      };
      return { ...store, next_id: ids.nextId, pools: [...store.pools, pool] };
    }
    case "save-cap": {
      const ids = action.capId === undefined ? allocateIds(store) : { firstId: action.capId, nextId: store.next_id };
      const updated = updatePool(action.poolId, (pool) => ({
        ...pool,
        caps: action.capId === undefined
          ? [...pool.caps, { ...action.cap, id: ids.firstId }]
          : pool.caps.map((cap) => cap.id === action.capId ? { ...action.cap, id: cap.id } : cap),
      }));
      return { ...updated, next_id: ids.nextId };
    }
    case "save-addition": {
      const { form, target } = action;
      const entries = [{ amount: form.amount, date: form.date },
        ...(!form.recurring && !form.reset ? form.additionalEntries ?? [] : [])];
      const ids = target ? { firstId: target.id, nextId: store.next_id } : allocateIds(store, entries.length);
      const updated = updatePool(action.poolId, (pool) => {
        const flags = {
          reset: form.reset || undefined,
          expires_same_day: !form.reset && (target ? form.expiresSameDay : pool.new_additions_expire_same_day) || undefined,
        };
        if (target?.type === "one-time") {
          return { ...pool, additions: pool.additions.map((addition) => addition.id === target.id
            ? definedFields({ ...addition, amount: form.amount, date: form.date, ...flags }) : addition) };
        }
        if (target?.type === "recurring" || form.recurring) {
          const nthWeekdayFields = form.cadence === "YearlyNthWeekday"
            ? { month: form.month, nth_weekday: form.nthWeekday, weekday: form.weekday }
            : { month: undefined, nth_weekday: undefined, weekday: undefined };
          const rule: RecurringAddition = {
            id: ids.firstId, amount: form.amount, ...flags, cadence: form.cadence,
            start_date: form.date, end_date: form.endDate, ...nthWeekdayFields,
          };
          return { ...pool, recurring: target
            ? pool.recurring.map((existing) => existing.id === target.id ? definedFields({ ...existing, ...rule }) : existing)
            : [...pool.recurring, definedFields(rule)] };
        }
        return { ...pool, additions: [...pool.additions,
          ...entries.map((entry, index) => definedFields({ ...entry, id: ids.firstId + index, ...flags }))] };
      });
      return { ...updated, next_id: ids.nextId };
    }
    case "save-event": {
      if (action.eventId !== undefined) {
        return { ...store, events: store.events.map((event) => event.id === action.eventId
          ? { ...event, name: action.name, days: action.days } : event) };
      }
      const ids = allocateIds(store);
      return { ...store, next_id: ids.nextId, events: [...store.events, { id: ids.firstId, name: action.name, days: action.days }] };
    }
    case "remove-pool":
      return {
        ...store,
        pools: store.pools.filter((pool) => pool.id !== action.poolId),
        events: store.events.map((event) => ({
          ...event,
          days: event.days.map((day) => ({
            ...day, allocations: day.allocations.filter((allocation) => allocation.pool_id !== action.poolId),
          })).filter((day) => day.allocations.length > 0),
        })).filter((event) => event.days.length > 0),
      };
    case "remove-addition":
      return updatePool(action.poolId, (pool) => action.recurring
        ? { ...pool, recurring: pool.recurring.filter((rule) => rule.id !== action.additionId) }
        : { ...pool, additions: pool.additions.filter((addition) => addition.id !== action.additionId) });
    case "remove-cap":
      return updatePool(action.poolId, (pool) => ({ ...pool, caps: pool.caps.filter((cap) => cap.id !== action.capId) }));
    case "remove-event":
      return { ...store, events: store.events.filter((event) => event.id !== action.eventId) };
    case "set-pool-visibility":
      return updatePool(action.poolId, (pool) => ({ ...pool, hidden_from_graph: !action.visible }));
    case "reorder-pool": {
      const from = store.pools.findIndex((pool) => pool.id === action.poolId);
      const to = store.pools.findIndex((pool) => pool.id === action.targetId);
      if (from < 0 || to < 0 || from === to) return store;
      const pools = [...store.pools];
      const [pool] = pools.splice(from, 1);
      if (!pool) return store;
      pools.splice(to, 0, pool);
      return { ...store, pools };
    }
  }
}
