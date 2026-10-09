export const NTH_WEEKDAYS = ["First", "Second", "Third", "Fourth", "Fifth", "Last"] as const;
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export type NthWeekday = typeof NTH_WEEKDAYS[number];
export type Weekday = typeof WEEKDAYS[number];
export type Cadence = "Weekly" | "Fortnightly" | "Monthly" | "Yearly" | "YearlyNthWeekday";

export interface OneTimeAddition {
  id: number;
  reset?: boolean;
  expires_same_day?: boolean;
  amount: number;
  date: string;
}

export interface RecurringAddition {
  id: number;
  reset?: boolean;
  expires_same_day?: boolean;
  amount: number;
  cadence: Cadence;
  start_date: string;
  end_date?: string;
  month?: number;
  nth_weekday?: NthWeekday;
  weekday?: Weekday;
}

export interface PoolCap {
  id: number;
  max_balance: number;
  start_date: string;
  end_date?: string;
}

export interface Pool {
  new_additions_expire_same_day?: boolean;
  color?: string;
  id: number;
  name: string;
  hidden_from_graph?: boolean;
  hidden_from_total?: boolean;
  additions: OneTimeAddition[];
  recurring: RecurringAddition[];
  caps: PoolCap[];
}

export interface PoolAllocation {
  pool_id: number;
  hours: number;
}

export interface LeaveDay {
  date: string;
  allocations: PoolAllocation[];
}

export interface LeaveEvent {
  id: number;
  name: string;
  days: LeaveDay[];
}

export interface Store {
  version: typeof STORE_VERSION;
  pools: Pool[];
  events: LeaveEvent[];
  next_id: number;
}

export interface EventDayInput {
  date: string;
  allocations: PoolAllocationInput[];
}

export interface PoolAllocationInput {
  pool_id: number;
  hours: string;
}

export interface BalancePoint {
  date: string;
  balance: number;
  projected: boolean;
}

export const STORAGE_KEY = "hima.store.v1";
export const STORE_VERSION = 1;

export function emptyStore(): Store {
  return { version: STORE_VERSION, pools: [], events: [], next_id: 1 };
}

export interface PoolFormData {
  name: string;
  openingAmount: string;
  openingDate: string;
  hiddenFromGraph: boolean;
  hiddenFromTotal: boolean;
  color?: string;
  newAdditionsExpireSameDay?: boolean;
}

export interface AdditionFormData {
  additionalEntries?: { amount: number; date: string }[];
  reset: boolean;
  expiresSameDay?: boolean;
  amount: number;
  date: string;
  recurring: boolean;
  cadence: Cadence;
  endDate?: string;
  month?: number;
  nthWeekday?: NthWeekday;
  weekday?: Weekday;
}

export type PoolCapFormData = Omit<PoolCap, "id"> & { id?: number };

export type StoreAction =
  | (PoolFormData & { type: "save-pool"; poolId?: number })
  | { type: "save-cap"; poolId: number; capId?: number; cap: PoolCapFormData }
  | { type: "save-addition"; poolId: number; target?: { type: "one-time" | "recurring"; id: number }; form: AdditionFormData }
  | { type: "save-event"; eventId?: number; name: string; days: LeaveDay[] }
  | { type: "remove-pool"; poolId: number }
  | { type: "remove-addition"; poolId: number; additionId: number; recurring: boolean }
  | { type: "remove-cap"; poolId: number; capId: number }
  | { type: "remove-event"; eventId: number }
  | { type: "reorder-pool"; poolId: number; targetId: number }
  | { type: "set-pool-visibility"; poolId: number; visible: boolean };

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
    } else if (action.target && !(action.target.type === "one-time" ? pool.additions : pool.recurring).some((entry) => entry.id === action.target!.id)) {
      return "This addition no longer exists.";
    }
  }
  return null;
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
      const settings = { name: action.name, hidden_from_graph: action.hiddenFromGraph, hidden_from_total: action.hiddenFromTotal, new_additions_expire_same_day: action.newAdditionsExpireSameDay || undefined };
      if (action.poolId !== undefined) return updatePool(action.poolId, (pool) => ({ ...pool, ...settings, color: action.color }));
      const amount = action.openingAmount.trim() === "" ? 0 : parseHours(action.openingAmount, true)!;
      const ids = allocateIds(store, amount > 0 ? 2 : 1);
      return { ...store, next_id: ids.nextId, pools: [...store.pools, {
        id: ids.firstId, ...settings, additions: amount > 0 ? [{ id: ids.firstId + 1, amount, date: action.openingDate, expires_same_day: action.newAdditionsExpireSameDay || undefined }] : [], recurring: [], caps: [],
      }] };
    }
    case "save-cap": {
      const ids = action.capId === undefined ? allocateIds(store) : { firstId: action.capId, nextId: store.next_id };
      return { ...updatePool(action.poolId, (pool) => ({ ...pool, caps: action.capId === undefined
        ? [...pool.caps, { ...action.cap, id: ids.firstId }]
        : pool.caps.map((cap) => cap.id === action.capId ? { ...action.cap, id: cap.id } : cap) })), next_id: ids.nextId };
    }
    case "save-addition": {
      const { form, target } = action;
      const entries = [{ amount: form.amount, date: form.date }, ...(!form.recurring && !form.reset ? form.additionalEntries ?? [] : [])];
      const ids = target ? { firstId: target.id, nextId: store.next_id } : allocateIds(store, entries.length);
      return { ...updatePool(action.poolId, (pool) => {
        const flags = { reset: form.reset || undefined, expires_same_day: !form.reset && (target ? form.expiresSameDay : pool.new_additions_expire_same_day) || undefined };
        if (target?.type === "one-time") return { ...pool, additions: pool.additions.map((addition) => addition.id === target.id ? { ...addition, amount: form.amount, date: form.date, ...flags } : addition) };
        if (target?.type === "recurring" || form.recurring) {
          const rule: RecurringAddition = { id: ids.firstId, amount: form.amount, ...flags, cadence: form.cadence, start_date: form.date, end_date: form.endDate,
            month: form.cadence === "YearlyNthWeekday" ? form.month : undefined,
            nth_weekday: form.cadence === "YearlyNthWeekday" ? form.nthWeekday : undefined,
            weekday: form.cadence === "YearlyNthWeekday" ? form.weekday : undefined };
          return { ...pool, recurring: target ? pool.recurring.map((existing) => existing.id === target.id ? { ...existing, ...rule } : existing) : [...pool.recurring, rule] };
        }
        return { ...pool, additions: [...pool.additions, ...entries.map((entry, index) => ({ ...entry, id: ids.firstId + index, ...flags }))] };
      }), next_id: ids.nextId };
    }
    case "save-event": {
      if (action.eventId !== undefined) return { ...store, events: store.events.map((event) => event.id === action.eventId ? { ...event, name: action.name, days: action.days } : event) };
      const ids = allocateIds(store);
      return { ...store, next_id: ids.nextId, events: [...store.events, { id: ids.firstId, name: action.name, days: action.days }] };
    }
    case "remove-pool":
      return { ...store, pools: store.pools.filter((pool) => pool.id !== action.poolId), events: store.events.map((event) => ({ ...event,
        days: event.days.map((day) => ({ ...day, allocations: day.allocations.filter((allocation) => allocation.pool_id !== action.poolId) })).filter((day) => day.allocations.length > 0),
      })).filter((event) => event.days.length > 0) };
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
      pools.splice(to, 0, pool);
      return { ...store, pools };
    }
  }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function amountValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && Number.isFinite(parsed * 100) ? roundHours(parsed) : 0;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function capRangesOverlap(
  ranges: Array<Pick<PoolCap, "start_date" | "end_date">>,
): boolean {
  const sorted = [...ranges].sort((left, right) => left.start_date.localeCompare(right.start_date));
  return sorted.some((range, index) => {
    const previous = sorted[index - 1];
    return previous !== undefined && (!previous.end_date || previous.end_date >= range.start_date);
  });
}

function cadenceValue(value: unknown): Cadence {
  switch (value) {
    case "Weekly":
    case "weekly":
      return "Weekly";
    case "Fortnightly":
    case "fortnightly":
      return "Fortnightly";
    case "Yearly":
    case "yearly":
      return "Yearly";
    case "YearlyNthWeekday":
    case "yearly_nth_weekday":
      return "YearlyNthWeekday";
    default:
      return "Monthly";
  }
}

function nthWeekdayValue(value: unknown): NthWeekday | null {
  return NTH_WEEKDAYS.find((occurrence) => occurrence === value) ?? null;
}

function weekdayValue(value: unknown): Weekday | null {
  return WEEKDAYS.find((weekday) => weekday === value) ?? null;
}

function normalizeAllocation(value: unknown, fallbackPoolId: number): PoolAllocation | null {
  const allocation = record(value);
  const poolId = numberValue(allocation.pool_id, fallbackPoolId) || fallbackPoolId;
  const hours = amountValue(allocation.hours);
  return poolId > 0 && hours > 0 ? { pool_id: poolId, hours } : null;
}

function normalizeDay(value: unknown, legacyPoolId: number, poolIds: Set<number>, warnings: string[], legacy: boolean): LeaveDay | null {
  const day = record(value);
  const date = stringValue(day.date);
  if (!isValidDate(date)) return null;

  const dayPoolId = legacy ? numberValue(day.pool_id, legacyPoolId) || legacyPoolId : 0;
  const rawAllocations = Array.isArray(day.allocations) ? day.allocations : [];
  const allocations = rawAllocations.length
    ? normalizeEntries(rawAllocations, (value) => {
        const allocation = normalizeAllocation(value, dayPoolId);
        return allocation && poolIds.has(allocation.pool_id) ? [allocation] : [];
      }, "allocations (invalid or missing pool)", warnings)
    : legacy && amountValue(day.hours) > 0 && poolIds.has(dayPoolId)
      ? [{ pool_id: dayPoolId, hours: amountValue(day.hours) }]
      : [];

  return allocations.length ? { date, allocations } : null;
}

function normalizeEvent(value: unknown, poolIds: Set<number>, warnings: string[], legacy: boolean): LeaveEvent | null {
  const event = record(value);
  const id = numberValue(event.id);
  const name = stringValue(event.name).trim();
  if (!id || !name) return null;

  const legacyPoolId = legacy ? numberValue(event.pool_id) : 0;
  let days = Array.isArray(event.days)
    ? normalizeEntries(event.days, (value) => {
        const day = normalizeDay(value, legacyPoolId, poolIds, warnings, legacy);
        return day ? [day] : [];
      }, "event days", warnings)
    : [];

  if (legacy && !Array.isArray(event.days) && isValidDate(stringValue(event.date)) && amountValue(event.amount) > 0 && poolIds.has(legacyPoolId)) {
    days = [
      {
        date: stringValue(event.date),
        allocations: [{ pool_id: legacyPoolId, hours: amountValue(event.amount) }],
      },
    ];
  }

  return days.length ? { id, name, days: sortDays(days) } : null;
}

// Keep the first valid entry for each ID within a collection. Report every
// ignored entry, including nested entries, before the import is confirmed.
function normalizeEntries<T>(values: unknown[], normalize: (value: unknown) => T[], label: string, warnings: string[]): T[] {
  const ids = new Set<number>();
  let dropped = 0;
  const entries = values.flatMap((value) => {
    const normalized = normalize(value);
    const id = (normalized[0] as { id?: number } | undefined)?.id;
    if (!normalized.length || (id !== undefined && ids.has(id))) {
      dropped += 1;
      return [];
    }
    if (id !== undefined) ids.add(id);
    return normalized;
  });
  if (dropped) warnings.push(`Ignored ${dropped} ${label} (invalid or duplicate).`);
  return entries;
}

export function normalizeStore(value: unknown, warnings: string[] = []): Store {
  const source = record(value);
  // Unversioned saves include all historical event shapes. Only that schema
  // uses the legacy fallbacks; versioned data uses explicit day allocations.
  const legacy = source.version === undefined;
  if (!legacy && source.version !== STORE_VERSION) {
    throw new Error(`Unsupported data schema version: ${String(source.version)}. This app supports version ${STORE_VERSION}.`);
  }
  const pools = Array.isArray(source.pools)
    ? normalizeEntries(source.pools, (value): Pool[] => {
        const pool = record(value);
        const id = numberValue(pool.id);
        const name = stringValue(pool.name).trim();
        if (!id || !name) return [];

        const additions = Array.isArray(pool.additions)
          ? normalizeEntries(pool.additions, (value): OneTimeAddition[] => {
              const addition = record(value);
              const additionId = numberValue(addition.id);
              const date = stringValue(addition.date);
              const amount = amountValue(addition.amount);
              const reset = addition.reset === true;
              return additionId && isValidDate(date) && (reset || amount > 0)
                ? [{ id: additionId, date, amount: reset ? Math.max(0, amount) : amount, ...(reset ? { reset: true } : {}), ...(!reset && addition.expires_same_day === true ? { expires_same_day: true } : {}) }]
                : [];
            }, "one-time additions", warnings)
          : [];
        const recurring = Array.isArray(pool.recurring)
          ? normalizeEntries(pool.recurring, (value): RecurringAddition[] => {
              const rule = record(value);
              const ruleId = numberValue(rule.id);
              const startDate = stringValue(rule.start_date);
              const endDate = stringValue(rule.end_date);
              const amount = amountValue(rule.amount);
              const cadence = cadenceValue(rule.cadence);
              const nthWeekday = nthWeekdayValue(rule.nth_weekday);
              const weekday = weekdayValue(rule.weekday);
              const month = numberValue(rule.month);
              const validNthWeekdayRule =
                cadence !== "YearlyNthWeekday" ||
                (nthWeekday !== null && weekday !== null && month >= 1 && month <= 12);
              const reset = rule.reset === true;
              return ruleId && isValidDate(startDate) && (reset || amount > 0) && (!endDate || isValidDate(endDate)) && validNthWeekdayRule
                ? [{
                    id: ruleId,
                    amount: reset ? Math.max(0, amount) : amount,
                    ...(reset ? { reset: true } : {}),
                    ...(!reset && rule.expires_same_day === true ? { expires_same_day: true } : {}),
                    start_date: startDate,
                    cadence,
                    ...(isValidDate(endDate) ? { end_date: endDate } : {}),
                    ...(cadence === "YearlyNthWeekday"
                      ? { month, nth_weekday: nthWeekday!, weekday: weekday! }
                      : {}),
                  }]
                : [];
            }, "recurring additions", warnings)
          : [];
        const capCandidates = Array.isArray(pool.caps)
          ? normalizeEntries(pool.caps, (value): PoolCap[] => {
              const cap = record(value);
              const capId = numberValue(cap.id);
              const rawMaxBalance = cap.max_balance;
              const maxBalance = amountValue(rawMaxBalance);
              const hasValidMaxBalance =
                (typeof rawMaxBalance === "number" ||
                  (typeof rawMaxBalance === "string" && rawMaxBalance.trim() !== "")) &&
                Number.isFinite(Number(rawMaxBalance));
              const startDate = stringValue(cap.start_date);
              const endDate = stringValue(cap.end_date);
              return capId && hasValidMaxBalance && maxBalance >= 0 && isValidDate(startDate) && (!endDate || (isValidDate(endDate) && startDate <= endDate))
                ? [{ id: capId, max_balance: maxBalance, start_date: startDate, ...(endDate ? { end_date: endDate } : {}) }]
                : [];
            }, "caps", warnings)
          : [];
        const caps: PoolCap[] = [];
        for (const cap of capCandidates.sort((left, right) => left.start_date.localeCompare(right.start_date))) {
          const previous = caps.at(-1);
          if (!previous || (previous.end_date && previous.end_date < cap.start_date)) caps.push(cap);
          else warnings.push("Ignored 1 overlapping cap.");
        }
        return [{ id, name, additions, recurring, caps,
          ...(pool.new_additions_expire_same_day === true ? { new_additions_expire_same_day: true } : {}),
          ...(typeof pool.color === "string" && /^#[0-9a-f]{6}$/i.test(pool.color) ? { color: pool.color } : {}),
          ...(pool.hidden_from_graph === true ? { hidden_from_graph: true } : {}),
          ...(pool.hidden_from_total === true ? { hidden_from_total: true } : {}),
        }];
      }, "pools", warnings)
    : [];
  const poolIds = new Set(pools.map((pool) => pool.id));
  const events = Array.isArray(source.events)
    ? normalizeEntries(source.events, (value) => {
        const event = normalizeEvent(value, poolIds, warnings, legacy);
        return event ? [event] : [];
      }, "events", warnings)
    : [];

  const largestId = [
    ...pools.flatMap((pool) => [
      pool.id,
      ...pool.additions.map((addition) => addition.id),
      ...pool.recurring.map((rule) => rule.id),
      ...pool.caps.map((cap) => cap.id),
    ]),
    ...events.map((event) => event.id),
  ].reduce((largest, id) => Math.max(largest, id), 0);
  const storedNextId = numberValue(source.next_id, 1);

  return { version: STORE_VERSION, pools, events, next_id: Math.max(storedNextId, largestId + 1, 1) };
}

export function serializeStoreJson(store: Store): string {
  return JSON.stringify(store, null, 2);
}

export function parseStoreJson(json: string, warnings: string[] = []): Store {
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("This file does not contain a hima data export.");
  }
  const source = value as Record<string, unknown>;
  if (!Array.isArray(source.pools) || !Array.isArray(source.events)) {
    throw new Error("This file does not contain a hima data export.");
  }

  return normalizeStore(source, warnings);
}

export interface StoreLoadResult {
  store: Store;
  warning: string | null;
  canSave: boolean;
}

export function loadStore(): StoreLoadResult {
  let saved: string | null;
  try {
    saved = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return { store: emptyStore(), canSave: false, warning: "Browser storage could not be read. Saving is disabled for this session; export any changes to keep them." };
  }
  if (saved === null) return { store: emptyStore(), warning: null, canSave: true };
  try {
    return { store: parseStoreJson(saved), warning: null, canSave: true };
  } catch {
    try {
      // Never replace an earlier recovery copy. Reuse an identical copy on
      // remount (including StrictMode), otherwise choose the next unused key.
      let backupKey = `${STORAGE_KEY}.backup`;
      for (let suffix = 1; ; suffix += 1) {
        const existing = window.localStorage.getItem(backupKey);
        if (existing === saved) break;
        if (existing === null) {
          window.localStorage.setItem(backupKey, saved);
          break;
        }
        backupKey = `${STORAGE_KEY}.backup.${suffix}`;
      }
      return {
        store: emptyStore(), canSave: true,
        warning: `Saved data could not be loaded. The original has been preserved in browser storage under ${backupKey}. An empty planner is shown; new changes will replace the active saved data but keep that recovery copy.`,
      };
    } catch {
      return {
        store: emptyStore(), canSave: false,
        warning: "Saved data could not be loaded or backed up. The original has not been overwritten. Saving is disabled for this session; export any changes to keep them.",
      };
    }
  }
}

export function saveStore(store: Store): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    // Keep the planner usable when browser storage is unavailable or full.
    return false;
  }
}

export function allocateIds(store: Store, count = 1): { firstId: number; nextId: number } {
  const largestId = [
    ...store.pools.flatMap((pool) => [
      pool.id,
      ...pool.additions.map((addition) => addition.id),
      ...pool.recurring.map((rule) => rule.id),
      ...pool.caps.map((cap) => cap.id),
    ]),
    ...store.events.map((event) => event.id),
  ].reduce((largest, id) => Math.max(largest, id), 0);
  const firstId = Math.max(store.next_id, largestId + 1, 1);
  return { firstId, nextId: firstId + count };
}

export function cadenceLabel(cadence: Cadence): string {
  switch (cadence) {
    case "Weekly":
      return "week";
    case "Fortnightly":
      return "fortnight";
    case "Monthly":
      return "month";
    case "Yearly":
    case "YearlyNthWeekday":
      return "year";
  }
}

export function recurringScheduleDescription(rule: RecurringAddition): string {
  if (
    rule.cadence === "YearlyNthWeekday" &&
    rule.month !== undefined &&
    rule.nth_weekday &&
    rule.weekday
  ) {
    const month = MONTH_NAMES[rule.month - 1];
    if (month) {
      return `on the ${rule.nth_weekday.toLowerCase()} ${rule.weekday} of ${month} each year`;
    }
  }
  return `every ${cadenceLabel(rule.cadence)}`;
}

export function parseHours(value: string, allowZero = false): number | null {
  const amount = Number(value.trim());
  const cents = amount * 100;
  if (
    !Number.isFinite(amount) ||
    !Number.isFinite(cents) ||
    Math.abs(cents - Math.round(cents)) > 1e-7 ||
    amount < 0 ||
    (!allowZero && amount === 0)
  ) {
    return null;
  }
  return Math.round(cents) / 100;
}

export function formatHours(value: number): string {
  const rounded = Math.sign(value) * Math.round(Math.abs(value) * 100) / 100;
  if (Math.abs(rounded) < 0.005) return "0";
  if (Math.abs(rounded % 1) < 0.005) return rounded.toFixed(0);
  return rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatSignedHours(value: number): string {
  if (value > 0) return `+${formatHours(value)}`;
  if (value < 0) return `−${formatHours(-value)}`;
  return "0";
}

export function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
  );
}

export function validDateOrFallback(candidate: string, lastValidDate: string): string {
  return isValidDate(candidate) ? candidate : lastValidDate;
}

export function todayDate(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function dateFromParts(value: string): Date | null {
  if (!isValidDate(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateString(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function addDays(value: string, days: number): string {
  const date = dateFromParts(value);
  if (!date) return todayDate();
  date.setUTCDate(date.getUTCDate() + days);
  return dateString(date);
}

export function addMonths(value: string, months: number): string {
  const date = dateFromParts(value);
  if (!date) return todayDate();
  const day = date.getUTCDate();
  const firstOfTarget = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0)).getUTCDate();
  firstOfTarget.setUTCDate(Math.min(day, lastDay));
  return dateString(firstOfTarget);
}

export function prettyDate(value: string): string {
  const date = dateFromParts(value);
  return date
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      }).format(date)
    : value;
}

export function monthLabel(value: string): string {
  const date = dateFromParts(value);
  return date
    ? new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date).toUpperCase()
    : "";
}

export function dayLabel(value: string): string {
  const date = dateFromParts(value);
  return date ? String(date.getUTCDate()).padStart(2, "0") : "";
}

export function nthWeekdayInMonth(
  year: number,
  month: number,
  nthWeekday: NthWeekday,
  weekday: Weekday,
): string | null {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  const weekdayIndex = WEEKDAYS.indexOf(weekday);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let day: number;
  if (nthWeekday === "Last") {
    const lastWeekday = new Date(Date.UTC(year, month - 1, daysInMonth)).getUTCDay();
    day = daysInMonth - ((lastWeekday - weekdayIndex + 7) % 7);
  } else {
    const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const occurrence = NTH_WEEKDAYS.indexOf(nthWeekday) + 1;
    day = 1 + ((weekdayIndex - firstWeekday + 7) % 7) + (occurrence - 1) * 7;
    if (day > daysInMonth) return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function recurringOccurrencesThrough(rule: RecurringAddition, date: string): number {
  if (!isValidDate(rule.start_date) || !isValidDate(date)) return 0;
  if (rule.end_date && !isValidDate(rule.end_date)) return 0;
  const endDate = rule.end_date && date > rule.end_date ? rule.end_date : date;
  if (endDate < rule.start_date) return 0;
  if (rule.cadence === "YearlyNthWeekday") {
    if (rule.month === undefined || !rule.nth_weekday || !rule.weekday) return 0;
    let occurrences = 0;
    for (let year = Number(rule.start_date.slice(0, 4)); year <= Number(endDate.slice(0, 4)); year += 1) {
      const occurrence = nthWeekdayInMonth(year, rule.month, rule.nth_weekday, rule.weekday);
      if (occurrence && occurrence >= rule.start_date && occurrence <= endDate) occurrences += 1;
    }
    return occurrences;
  }
  const start = dateFromParts(rule.start_date)!;
  const end = dateFromParts(endDate)!;
  const elapsedDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
  if (rule.cadence === "Weekly") return Math.floor(elapsedDays / 7) + 1;
  if (rule.cadence === "Fortnightly") return Math.floor(elapsedDays / 14) + 1;

  const monthsPerPeriod = rule.cadence === "Monthly" ? 1 : 12;
  const elapsedMonths =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    end.getUTCMonth() -
    start.getUTCMonth();
  let periods = Math.floor(elapsedMonths / monthsPerPeriod);
  while (periods >= 0) {
    if (addMonths(rule.start_date, periods * monthsPerPeriod) <= endDate) return periods + 1;
    periods -= 1;
  }
  return 0;
}

export function poolAccruedOn(pool: Pool, date: string, events: LeaveEvent[] = []): number {
  return poolLedgerForDates(pool, events, [date])[0]?.accrued ?? 0;
}

export function eventTotalHours(event: LeaveEvent): number {
  return event.days.reduce(
    (total, day) => total + day.allocations.reduce((dayTotal, allocation) => dayTotal + allocation.hours, 0),
    0,
  );
}

export function eventHoursThrough(event: LeaveEvent, date: string): number {
  return event.days
    .filter((day) => day.date <= date)
    .reduce(
      (total, day) => total + day.allocations.reduce((dayTotal, allocation) => dayTotal + allocation.hours, 0),
      0,
    );
}

export function eventHoursFromPoolThrough(event: LeaveEvent, poolId: number, date: string): number {
  return event.days
    .filter((day) => day.date <= date)
    .flatMap((day) => day.allocations)
    .filter((allocation) => allocation.pool_id === poolId)
    .reduce((total, allocation) => total + allocation.hours, 0);
}

export function totalsOn(store: Store, date: string): { accrued: number; used: number; balance: number } {
  const ledgers = store.pools
    .filter((pool) => !pool.hidden_from_total)
    .map((pool) => poolLedgerForDates(pool, store.events, [date])[0]);
  const accrued = ledgers.reduce((total, ledger) => total + (ledger?.accrued ?? 0), 0);
  const used = ledgers.reduce((total, ledger) => total + (ledger?.used ?? 0), 0);
  const balance = ledgers.reduce((total, ledger) => total + (ledger?.balance ?? 0), 0);
  return { accrued: roundHours(accrued), used: roundHours(used), balance: roundHours(balance) };
}

export function poolBalanceOn(store: Store, poolId: number, date: string): number {
  return poolTotalsOn(store, poolId, date).balance;
}

export function poolTotalsOn(
  store: Store,
  poolId: number,
  date: string,
): PoolLedgerSnapshot {
  const pool = store.pools.find((candidate) => candidate.id === poolId);
  return pool
    ? poolLedgerForDates(pool, store.events, [date])[0] ?? { accrued: 0, used: 0, balance: 0 }
    : { accrued: 0, used: 0, balance: 0 };
}

export function sortDays(days: LeaveDay[]): LeaveDay[] {
  return [...days].sort((left, right) => left.date.localeCompare(right.date));
}

export function eventBalanceWarnings(store: Store, days: LeaveDay[], replacingEventId?: number): Array<{ poolId: number; date: string; balance: number }> {
  const firstDate = sortDays(days)[0]?.date;
  if (!firstDate) return [];
  const events = [...store.events.filter((event) => event.id !== replacingEventId), { id: store.next_id, name: "Event preview", days }];
  const affectedPoolIds = new Set(days.flatMap((day) => day.allocations.map((allocation) => allocation.pool_id)));
  const dates = [...new Set(events.flatMap((event) => event.days.map((day) => day.date)))].filter((date) => date >= firstDate).sort();
  return store.pools.filter((pool) => affectedPoolIds.has(pool.id)).flatMap((pool) => {
    const balances = poolLedgerForDates(pool, events, dates);
    const index = balances.findIndex((ledger) => ledger.balance < 0);
    return index < 0 ? [] : [{ poolId: pool.id, date: dates[index], balance: balances[index].balance }];
  });
}

export function freshEventDays(_poolId: number): EventDayInput[] {
  return [];
}

export function eventDateRangeLabel(event: LeaveEvent): string {
  const dates = event.days.map((day) => day.date).sort();
  const first = prettyDate(dates[0] ?? "");
  const last = prettyDate(dates.at(-1) ?? "");
  return first === last ? first : `${first} – ${last}`;
}

export function eventDaySummary(event: LeaveEvent, pools: Pool[]): string {
  return event.days
    .map((day) => {
      const allocations = day.allocations
        .map((allocation) => {
          const name = pools.find((pool) => pool.id === allocation.pool_id)?.name ?? "Removed pool";
          return `${formatHours(allocation.hours)} h from ${name}`;
        })
        .join(" + ");
      return `${prettyDate(day.date)}: ${allocations}`;
    })
    .join(" · ");
}

export function eventPoolSummary(event: LeaveEvent, pools: Pool[]): string {
  const names = new Set(
    event.days.flatMap((day) =>
      day.allocations.map(
        (allocation) => pools.find((pool) => pool.id === allocation.pool_id)?.name ?? "Removed pool",
      ),
    ),
  );
  if (names.size === 0) return "No pool";
  if (names.size === 1) return [...names][0] ?? "No pool";
  return `Pools: ${[...names].join(", ")}`;
}

export function balanceHistory(store: Store, today: string, poolId?: number): BalancePoint[] {
  return balanceHistoryForDates(store, today, balanceHistoryDates(store, today, poolId), poolId);
}

export function balanceHistoryDates(store: Store, today: string, poolId?: number): string[] {
  if (!isValidDate(today)) return [];
  const pools = poolId === undefined
    ? store.pools.filter((pool) => !pool.hidden_from_graph)
    : store.pools.filter((pool) => pool.id === poolId);
  const poolIds = new Set(pools.map((pool) => pool.id));
  const eventDates = store.events.flatMap((event) => event.days
    .filter((day) => day.allocations.some((allocation) => poolIds.has(allocation.pool_id)))
    .map((day) => day.date)).filter(isValidDate);
  const relevantDates = [
    ...pools.flatMap((pool) => [
      ...pool.additions.map((addition) => addition.date),
      ...pool.recurring.map((rule) => rule.start_date),
      ...pool.caps.map((cap) => cap.start_date),
    ]),
    ...store.events.flatMap((event) =>
      event.days
        .filter((day) => day.allocations.some((allocation) => poolIds.has(allocation.pool_id)))
        .map((day) => day.date),
    ),
  ].filter(isValidDate);
  const defaultStart = addMonths(today, -12);
  const earliestDate = relevantDates.reduce(
    (earliest, date) => date < earliest ? date : earliest,
    defaultStart,
  );
  const start = eventDates.reduce((first, date) => {
    const buffered = addDays(date, -7);
    return buffered < first ? buffered : first;
  }, earliestDate);
  const end = eventDates.reduce((last, date) => {
    const buffered = addDays(date, 7);
    return buffered > last ? buffered : last;
  }, `${Number(today.slice(0, 4)) + 1}-12-31`);
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

// Chart series must replay their ledgers over the same dates, even when a
// different pool supplies the earliest opening balance or latest leave event.
export function balanceHistoryForDates(store: Store, today: string, dates: string[], poolId?: number): BalancePoint[] {
  if (!isValidDate(today)) return [];
  const pools = poolId === undefined
    ? store.pools.filter((pool) => !pool.hidden_from_graph)
    : store.pools.filter((pool) => pool.id === poolId);
  const ledgers = pools.map((pool) => poolLedgerForDates(pool, store.events, dates));
  return dates.map((date, index) => ({
    date,
    balance: roundHours(ledgers.reduce((total, ledger) => total + (ledger[index]?.balance ?? 0), 0)),
    projected: date > today,
  }));
}

interface PoolLedgerSnapshot {
  accrued: number;
  used: number;
  balance: number;
}

// Hours have hundredth-hour precision. Normalize arithmetic before balances
// reach comparisons, and avoid exposing negative zero to callers.
function roundHours(hours: number): number {
  return Math.round(hours * 100) / 100 || 0;
}

interface PoolDailyActions {
  accrued: number;
  expiring?: number;
  used: number;
  reset?: number;
}

function poolLedgerForDates(pool: Pool, events: LeaveEvent[], dates: string[]): PoolLedgerSnapshot[] {
  const throughDate = dates.at(-1);
  if (!throughDate || !isValidDate(throughDate)) return dates.map(() => ({ accrued: 0, used: 0, balance: 0 }));

  const actions = new Map<string, PoolDailyActions>();
  const actionForDate = (date: string): PoolDailyActions => {
    const existing = actions.get(date);
    if (existing) return existing;
    const created: PoolDailyActions = { accrued: 0, used: 0 };
    actions.set(date, created);
    return created;
  };
  const postCredit = (date: string, amount: number, expires: boolean | undefined) => {
    const daily = actionForDate(date);
    daily.accrued += amount;
    if (expires) {
      daily.expiring = (daily.expiring ?? 0) + amount;
      // Include the next day even when no other ledger actions happen then.
      const expiryDate = addDays(date, 1);
      if (expiryDate <= throughDate) actionForDate(expiryDate);
    }
  };

  for (const addition of pool.additions) {
    if (isValidDate(addition.date) && addition.date <= throughDate) {
      if (addition.reset) actionForDate(addition.date).reset = addition.amount;
      else postCredit(addition.date, addition.amount, addition.expires_same_day);
    }
  }

  for (const rule of pool.recurring) {
    if (!isValidDate(rule.start_date) || (rule.end_date && !isValidDate(rule.end_date))) continue;
    if (
      rule.cadence === "YearlyNthWeekday" &&
      (rule.month === undefined || !rule.nth_weekday || !rule.weekday)
    ) continue;
    const recurringEnd = rule.end_date && rule.end_date < throughDate ? rule.end_date : throughDate;
    if (rule.start_date > recurringEnd) continue;

    let occurrenceIndex = 0;
    let previousOccurrence = "";
    while (true) {
      let occurrenceDate: string | null;
      if (rule.cadence === "YearlyNthWeekday") {
        const occurrenceYear = Number(rule.start_date.slice(0, 4)) + occurrenceIndex;
        if (occurrenceYear > Number(recurringEnd.slice(0, 4))) break;
        occurrenceDate = nthWeekdayInMonth(occurrenceYear, rule.month!, rule.nth_weekday!, rule.weekday!);
        occurrenceIndex += 1;
        if (!occurrenceDate || occurrenceDate < rule.start_date) continue;
      } else {
        occurrenceDate =
          rule.cadence === "Weekly"
            ? addDays(rule.start_date, occurrenceIndex * 7)
            : rule.cadence === "Fortnightly"
              ? addDays(rule.start_date, occurrenceIndex * 14)
              : addMonths(rule.start_date, occurrenceIndex * (rule.cadence === "Monthly" ? 1 : 12));
      }
      if (
        !isValidDate(occurrenceDate) ||
        occurrenceDate > recurringEnd ||
        occurrenceDate <= previousOccurrence
      ) break;
      if (rule.reset) actionForDate(occurrenceDate).reset = rule.amount;
      else postCredit(occurrenceDate, rule.amount, rule.expires_same_day);
      previousOccurrence = occurrenceDate;
      if (rule.cadence !== "YearlyNthWeekday") occurrenceIndex += 1;
    }
  }

  for (const event of events) {
    for (const day of event.days) {
      if (!isValidDate(day.date) || day.date > throughDate) continue;
      const hours = day.allocations
        .filter((allocation) => allocation.pool_id === pool.id)
        .reduce((total, allocation) => total + allocation.hours, 0);
      if (hours > 0) actionForDate(day.date).used += hours;
    }
  }

  const orderedActions = [...actions.entries()].sort(([left], [right]) => left.localeCompare(right));
  let actionIndex = 0;
  let balance = 0;
  let accrued = 0;
  let used = 0;
  let expiringBalance = 0;
  return dates.map((date) => {
    while (actionIndex < orderedActions.length && orderedActions[actionIndex]![0] <= date) {
      const [actionDate, daily] = orderedActions[actionIndex]!;
      // Only the unused portion of the previous day's temporary credit expires.
      balance = roundHours(balance - expiringBalance);
      expiringBalance = 0;
      const activeCap = pool.caps.find(
        (cap) => cap.start_date <= actionDate && (!cap.end_date || actionDate <= cap.end_date),
      );
      // Cap each credit when posted; same-day leave use is applied after accrual.
      const acceptedAccrual = activeCap
        ? Math.min(daily.accrued, Math.max(0, activeCap.max_balance - balance))
        : daily.accrued;
      balance = roundHours(balance + acceptedAccrual - daily.used);
      // Permanent credits are posted first when a cap limits same-day accrual.
      const acceptedExpiring = Math.max(0, acceptedAccrual - (daily.accrued - (daily.expiring ?? 0)));
      expiringBalance = roundHours(Math.max(0, acceptedExpiring - daily.used));
      accrued = roundHours(accrued + acceptedAccrual);
      used = roundHours(used + daily.used);
      // Reset dates replace the remaining balance at the end of the day.
      if (daily.reset !== undefined) {
        balance = daily.reset;
        expiringBalance = 0;
      }
      actionIndex += 1;
    }
    return { accrued, used, balance };
  });
}
