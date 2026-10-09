import { isValidDate, WEEKDAYS, type Store } from "./model";
import { TIMELINE_PRESETS } from "./settings";
import type { BackupSettings } from "./backup";

export type PlannerDocument = Store & { settings?: BackupSettings };
export type PlannerSession = { user_id: number; csrf_token: string };
export type StoredPlanner = { document: PlannerDocument | null; revision: number; updated_at: string | null };

export interface PlannerPersistence {
  session(signal: AbortSignal): Promise<PlannerSession>;
  load(signal: AbortSignal): Promise<StoredPlanner>;
  save(document: PlannerDocument, revision: number, session: PlannerSession, signal: AbortSignal): Promise<StoredPlanner>;
  logout(session: PlannerSession, signal: AbortSignal): Promise<void>;
}

export class PersistenceError extends Error {
  constructor(public code: string, message: string, public status = 0) { super(message); }
}

export const defaultSettings: BackupSettings = { firstDayOfWeek: "Monday", ignoreWeekends: false, defaultTimeline: "±6 month" };

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
  const array = (v: unknown): unknown[] => Array.isArray(v) ? v : fail();
  const id = (v: unknown): number => typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : fail();
  const text = (v: unknown) => { if (typeof v !== "string" || !v.trim()) fail(); };
  const date = (v: unknown): string => typeof v === "string" && isValidDate(v) ? v : fail();
  const amount = (v: unknown, zero: boolean) => {
    if (typeof v !== "number" || !Number.isFinite(v) || (zero ? v < 0 : v <= 0) || Math.abs(v * 100 - Math.round(v * 100)) > 1e-7) fail();
  };
  const flags = (o: Record<string, unknown>, keys: string[]) => {
    for (const key of keys) if (key in o && typeof o[key] !== "boolean") fail();
  };
  let largest = 0;
  const entities = (v: unknown, visit: (o: unknown) => number) => {
    const seen = new Set<number>();
    for (const entry of array(v)) {
      const entityId = visit(entry);
      if (seen.has(entityId)) fail();
      seen.add(entityId);
      largest = Math.max(largest, entityId);
    }
    return seen;
  };
  const root = object(value, ["version", "pools", "events", "next_id"], ["settings"]);
  if (root.version !== 1) fail();
  const pools = entities(root.pools, (v) => {
    const pool = object(v, ["id", "name", "additions", "recurring", "caps"], ["color", "new_additions_expire_same_day", "hidden_from_graph", "hidden_from_total"]);
    text(pool.name);
    flags(pool, ["new_additions_expire_same_day", "hidden_from_graph", "hidden_from_total"]);
    if ("color" in pool && (typeof pool.color !== "string" || !/^#[0-9a-f]{6}$/i.test(pool.color))) fail();
    const addition = (v: unknown, recurring: boolean) => {
      const o = object(v, recurring ? ["id", "amount", "cadence", "start_date"] : ["id", "amount", "date"],
        recurring ? ["reset", "expires_same_day", "end_date", "month", "nth_weekday", "weekday"] : ["reset", "expires_same_day"]);
      flags(o, ["reset", "expires_same_day"]);
      amount(o.amount, o.reset === true);
      if (o.reset === true && o.expires_same_day === true) fail();
      date(recurring ? o.start_date : o.date);
      if (recurring) {
        if (!["Weekly", "Fortnightly", "Monthly", "Yearly", "YearlyNthWeekday"].includes(o.cadence as string)) fail();
        if ("end_date" in o) date(o.end_date);
        if (o.cadence === "YearlyNthWeekday") {
          if (typeof o.month !== "number" || !Number.isInteger(o.month) || o.month < 1 || o.month > 12 ||
            !["First", "Second", "Third", "Fourth", "Fifth", "Last"].includes(o.nth_weekday as string) || !WEEKDAYS.includes(o.weekday as typeof WEEKDAYS[number])) fail();
        } else if (["month", "nth_weekday", "weekday"].some((key) => key in o)) fail();
      }
      return id(o.id);
    };
    entities(pool.additions, (v) => addition(v, false));
    entities(pool.recurring, (v) => addition(v, true));
    const ranges: { start: string; end: string }[] = [];
    entities(pool.caps, (v) => {
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
  entities(root.events, (v) => {
    const event = object(v, ["id", "name", "days"]);
    text(event.name);
    const days = array(event.days);
    if (!days.length) fail();
    for (const v of days) {
      const day = object(v, ["date", "allocations"]);
      date(day.date);
      const allocations = array(day.allocations);
      if (!allocations.length) fail();
      for (const v of allocations) {
        const allocation = object(v, ["pool_id", "hours"]);
        if (!pools.has(id(allocation.pool_id))) fail();
        amount(allocation.hours, false);
      }
    }
    return id(event.id);
  });
  if (id(root.next_id) <= largest) fail();
  if ("settings" in root) {
    const settings = object(root.settings, ["firstDayOfWeek", "ignoreWeekends", "defaultTimeline"]);
    if (!WEEKDAYS.includes(settings.firstDayOfWeek as typeof WEEKDAYS[number]) || typeof settings.ignoreWeekends !== "boolean" ||
      !TIMELINE_PRESETS.includes(settings.defaultTimeline as typeof TIMELINE_PRESETS[number])) fail();
  }
}
