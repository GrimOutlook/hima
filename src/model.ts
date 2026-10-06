export type Cadence = "Weekly" | "Fortnightly" | "Monthly" | "Yearly";

export interface OneTimeAddition {
  id: number;
  amount: number;
  date: string;
}

export interface RecurringAddition {
  id: number;
  amount: number;
  cadence: Cadence;
  start_date: string;
}

export interface Pool {
  id: number;
  name: string;
  additions: OneTimeAddition[];
  recurring: RecurringAddition[];
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

const STORAGE_KEY = "hima.store.v1";

export function emptyStore(): Store {
  return { pools: [], events: [], next_id: 1 };
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
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
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
    default:
      return "Monthly";
  }
}

function normalizeAllocation(value: unknown, fallbackPoolId: number): PoolAllocation | null {
  const allocation = record(value);
  const poolId = numberValue(allocation.pool_id, fallbackPoolId) || fallbackPoolId;
  const hours = amountValue(allocation.hours);
  return poolId > 0 && hours > 0 ? { pool_id: poolId, hours } : null;
}

function normalizeDay(value: unknown, legacyPoolId: number): LeaveDay | null {
  const day = record(value);
  const date = stringValue(day.date);
  if (!isValidDate(date)) return null;

  const dayPoolId = numberValue(day.pool_id, legacyPoolId) || legacyPoolId;
  const rawAllocations = Array.isArray(day.allocations) ? day.allocations : [];
  const allocations = rawAllocations.length
    ? rawAllocations
        .map((allocation) => normalizeAllocation(allocation, dayPoolId))
        .filter((allocation): allocation is PoolAllocation => allocation !== null)
    : amountValue(day.hours) > 0 && dayPoolId > 0
      ? [{ pool_id: dayPoolId, hours: amountValue(day.hours) }]
      : [];

  return allocations.length ? { date, allocations } : null;
}

function normalizeEvent(value: unknown): LeaveEvent | null {
  const event = record(value);
  const id = numberValue(event.id);
  const name = stringValue(event.name).trim();
  if (!id || !name) return null;

  const legacyPoolId = numberValue(event.pool_id);
  let days = Array.isArray(event.days)
    ? event.days
        .map((day) => normalizeDay(day, legacyPoolId))
        .filter((day): day is LeaveDay => day !== null)
    : [];

  if (!days.length && isValidDate(stringValue(event.date)) && amountValue(event.amount) > 0 && legacyPoolId > 0) {
    days = [
      {
        date: stringValue(event.date),
        allocations: [{ pool_id: legacyPoolId, hours: amountValue(event.amount) }],
      },
    ];
  }

  return days.length ? { id, name, days: sortDays(days) } : null;
}

export function normalizeStore(value: unknown): Store {
  const source = record(value);
  const pools = Array.isArray(source.pools)
    ? source.pools.flatMap((value): Pool[] => {
        const pool = record(value);
        const id = numberValue(pool.id);
        const name = stringValue(pool.name).trim();
        if (!id || !name) return [];

        const additions = Array.isArray(pool.additions)
          ? pool.additions.flatMap((value): OneTimeAddition[] => {
              const addition = record(value);
              const additionId = numberValue(addition.id);
              const date = stringValue(addition.date);
              const amount = amountValue(addition.amount);
              return additionId && isValidDate(date) && amount > 0
                ? [{ id: additionId, date, amount }]
                : [];
            })
          : [];
        const recurring = Array.isArray(pool.recurring)
          ? pool.recurring.flatMap((value): RecurringAddition[] => {
              const rule = record(value);
              const ruleId = numberValue(rule.id);
              const startDate = stringValue(rule.start_date);
              const amount = amountValue(rule.amount);
              return ruleId && isValidDate(startDate) && amount > 0
                ? [{ id: ruleId, amount, start_date: startDate, cadence: cadenceValue(rule.cadence) }]
                : [];
            })
          : [];
        return [{ id, name, additions, recurring }];
      })
    : [];
  const events = Array.isArray(source.events)
    ? source.events
        .map(normalizeEvent)
        .filter((event): event is LeaveEvent => event !== null)
    : [];

  const largestId = [
    ...pools.flatMap((pool) => [pool.id, ...pool.additions.map((addition) => addition.id), ...pool.recurring.map((rule) => rule.id)]),
    ...events.map((event) => event.id),
  ].reduce((largest, id) => Math.max(largest, id), 0);
  const storedNextId = numberValue(source.next_id, 1);

  return { pools, events, next_id: Math.max(storedNextId, largestId + 1, 1) };
}

export function loadStore(): Store {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeStore(JSON.parse(saved) as unknown) : emptyStore();
  } catch {
    return emptyStore();
  }
}

export function saveStore(store: Store): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Keep the planner usable when browser storage is unavailable or full.
  }
}

export function allocateIds(store: Store, count = 1): { firstId: number; nextId: number } {
  const largestId = [
    ...store.pools.flatMap((pool) => [pool.id, ...pool.additions.map((addition) => addition.id), ...pool.recurring.map((rule) => rule.id)]),
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
      return "year";
  }
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

export function recurringOccurrencesThrough(rule: RecurringAddition, endDate: string): number {
  if (!isValidDate(rule.start_date) || !isValidDate(endDate) || endDate < rule.start_date) return 0;
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

export function poolAccruedOn(pool: Pool, date: string): number {
  const oneTime = pool.additions
    .filter((addition) => addition.date <= date)
    .reduce((total, addition) => total + addition.amount, 0);
  const recurring = pool.recurring.reduce(
    (total, rule) => total + rule.amount * recurringOccurrencesThrough(rule, date),
    0,
  );
  return oneTime + recurring;
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
  const accrued = store.pools.reduce((total, pool) => total + poolAccruedOn(pool, date), 0);
  const used = store.events.reduce((total, event) => total + eventHoursThrough(event, date), 0);
  return { accrued, used, balance: accrued - used };
}

export function poolBalanceOn(store: Store, poolId: number, date: string): number {
  const pool = store.pools.find((candidate) => candidate.id === poolId);
  const accrued = pool ? poolAccruedOn(pool, date) : 0;
  const used = store.events.reduce(
    (total, event) => total + eventHoursFromPoolThrough(event, poolId, date),
    0,
  );
  return accrued - used;
}

export function sortDays(days: LeaveDay[]): LeaveDay[] {
  return [...days].sort((left, right) => left.date.localeCompare(right.date));
}

export function freshEventDays(poolId: number): EventDayInput[] {
  return [{ date: todayDate(), allocations: [{ pool_id: poolId, hours: "" }] }];
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

export function balanceHistory(store: Store, today: string): BalancePoint[] {
  if (!isValidDate(today)) return [];
  const start = addMonths(today, -12);
  const end = addMonths(today, 12);
  const points: BalancePoint[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    points.push({ date, balance: totalsOn(store, date).balance, projected: date > today });
  }
  return points;
}
