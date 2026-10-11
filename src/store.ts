import { compareStartDates } from "./dates";
import { STORE_VERSION, type PoolCap, type Store } from "./types";

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function emptyStore(): Store {
  return { version: STORE_VERSION, pools: [], events: [], next_id: 1 };
}

export function largestStoreId(store: Pick<Store, "pools" | "events">): number {
  return [
    ...store.pools.flatMap((pool) => [
      pool.id,
      ...pool.additions.map((addition) => addition.id),
      ...pool.recurring.map((rule) => rule.id),
      ...pool.caps.map((cap) => cap.id),
    ]),
    ...store.events.map((event) => event.id),
  ].reduce((largest, id) => Math.max(largest, id), 0);
}

export function allocateIds(store: Store, count = 1): { firstId: number; nextId: number } {
  const firstId = Math.max(store.next_id, largestStoreId(store) + 1, 1);
  return { firstId, nextId: firstId + count };
}

export function capRangesOverlap(ranges: Array<Pick<PoolCap, "start_date" | "end_date">>): boolean {
  const sorted = [...ranges].sort(compareStartDates);
  return sorted.some((range, index) => {
    const previous = sorted[index - 1];
    return previous !== undefined && (!previous.end_date || previous.end_date >= range.start_date);
  });
}
