import { CADENCES, hasCentPrecision, isHexColor, isValidDate, MAX_EVENT_NAME_LENGTH, MAX_HISTORY_POINTS, MAX_POOL_NAME_LENGTH, NTH_WEEKDAYS, STORE_VERSION, WEEKDAYS, type Store } from "./model";
import { isValidSettings, type BackupSettings } from "./settings";

export type PlannerDocument = Store & { settings?: BackupSettings };
export type PlannerSession = { user_id: number; csrf_token: string };
export type StoredPlanner = { document: PlannerDocument | null; revision: number; updated_at: string | null };

export interface PlannerPersistence {
  session(signal: AbortSignal): Promise<PlannerSession>;
  load(signal: AbortSignal): Promise<StoredPlanner>;
  save(document: PlannerDocument, revision: number, session: PlannerSession, signal: AbortSignal): Promise<StoredPlanner>;
  logout(session: PlannerSession, signal: AbortSignal, everywhere?: boolean): Promise<void>;
}

export class PersistenceError extends Error {
  constructor(public code: string, message: string, public status = 0) { super(message); }
}

// Remote documents must never use the repairing legacy-import parser. Reject
// unsupported/malformed responses rather than dropping data and saving it back.
export function validateDocument(value: unknown): asserts value is PlannerDocument {
  const fail = (): never => { throw new PersistenceError("invalid_document", "The planner document is invalid or unsupported."); };
  const object = (v: unknown, required: string[], optional: string[] = []) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return fail();
    const obj = v as Record<string, unknown>;
    if (required.some((key) => !(key in obj)) || Object.keys(obj).some((key) => ![...required, ...optional].includes(key))) fail();
    return obj;
  };
  const array = (v: unknown, limit: number): unknown[] => Array.isArray(v) && v.length <= limit ? v : fail();
  const id = (v: unknown): number => typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : fail();
  const text = (v: unknown, limit: number) => { if (typeof v !== "string" || !v.trim() || v.length > limit) fail(); };
  const date = (v: unknown): string => typeof v === "string" && isValidDate(v) ? v : fail();
  const amount = (v: unknown, zero: boolean) => {
    if (typeof v !== "number" || !hasCentPrecision(v) || v > 1_000_000 || (zero ? v < 0 : v <= 0)) fail();
  };
  const flags = (o: Record<string, unknown>, keys: string[]) => {
    for (const key of keys) if (key in o && typeof o[key] !== "boolean") fail();
  };
  let largest = 0;
  const entities = (v: unknown, limit: number, visit: (o: unknown) => number) => {
    const seen = new Set<number>();
    for (const entry of array(v, limit)) {
      const entityId = visit(entry);
      if (seen.has(entityId)) fail();
      seen.add(entityId);
      largest = Math.max(largest, entityId);
    }
    return seen;
  };
  const root = object(value, ["version", "pools", "events", "next_id"], ["settings"]);
  if (root.version !== STORE_VERSION) fail();
  const pools = entities(root.pools, 100, (v) => {
    const pool = object(v, ["id", "name", "additions", "recurring", "caps"], ["color", "new_additions_expire_same_day", "hidden_from_graph", "hidden_from_total"]);
    text(pool.name, MAX_POOL_NAME_LENGTH);
    flags(pool, ["new_additions_expire_same_day", "hidden_from_graph", "hidden_from_total"]);
    if ("color" in pool && !isHexColor(pool.color)) fail();
    const addition = (v: unknown, recurring: boolean) => {
      const o = object(v, recurring ? ["id", "amount", "cadence", "start_date"] : ["id", "amount", "date"],
        recurring ? ["reset", "expires_same_day", "end_date", "month", "nth_weekday", "weekday"] : ["reset", "expires_same_day"]);
      flags(o, ["reset", "expires_same_day"]);
      amount(o.amount, o.reset === true);
      if (o.reset === true && o.expires_same_day === true) fail();
      date(recurring ? o.start_date : o.date);
      if (recurring) {
        if (!CADENCES.includes(o.cadence as typeof CADENCES[number])) fail();
        if ("end_date" in o) date(o.end_date);
        if (o.cadence === "YearlyNthWeekday") {
          if (typeof o.month !== "number" || !Number.isInteger(o.month) || o.month < 1 || o.month > 12 ||
            !NTH_WEEKDAYS.includes(o.nth_weekday as typeof NTH_WEEKDAYS[number]) || !WEEKDAYS.includes(o.weekday as typeof WEEKDAYS[number])) fail();
        } else if (["month", "nth_weekday", "weekday"].some((key) => key in o)) fail();
      }
      return id(o.id);
    };
    entities(pool.additions, 10_000, (v) => addition(v, false));
    entities(pool.recurring, 1000, (v) => addition(v, true));
    const ranges: { start: string; end: string }[] = [];
    entities(pool.caps, 1000, (v) => {
      const cap = object(v, ["id", "max_balance", "start_date"], ["end_date"]);
      amount(cap.max_balance, true);
      const start = date(cap.start_date);
      const end = "end_date" in cap ? date(cap.end_date) : "9999-12-31";
      if (end < start || ranges.some((r) => start <= r.end && end >= r.start)) fail();
      ranges.push({ start, end });
      return id(cap.id);
    });
    return id(pool.id);
  });
  entities(root.events, 10_000, (v) => {
    const event = object(v, ["id", "name", "days"]);
    text(event.name, MAX_EVENT_NAME_LENGTH);
    const days = array(event.days, MAX_HISTORY_POINTS);
    if (!days.length) fail();
    const dates = new Set<string>();
    for (const v of days) {
      const day = object(v, ["date", "allocations"]);
      const dayDate = date(day.date);
      if (dates.has(dayDate)) fail();
      dates.add(dayDate);
      const allocations = array(day.allocations, 100);
      if (!allocations.length) fail();
      const allocatedPools = new Set<number>();
      for (const v of allocations) {
        const allocation = object(v, ["pool_id", "hours"]);
        const poolId = id(allocation.pool_id);
        if (!pools.has(poolId) || allocatedPools.has(poolId)) fail();
        allocatedPools.add(poolId);
        amount(allocation.hours, false);
      }
    }
    return id(event.id);
  });
  if (id(root.next_id) <= largest) fail();
  if ("settings" in root) {
    const settings = object(root.settings, ["firstDayOfWeek", "ignoreWeekends", "defaultTimeline"]);
    if (!isValidSettings(settings)) fail();
  }
}
