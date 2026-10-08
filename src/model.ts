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
  amount: number;
  date: string;
}

export interface RecurringAddition {
  id: number;
  reset?: boolean;
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
              const reset = addition.reset === true;
              return additionId && isValidDate(date) && (reset || amount > 0)
                ? [{ id: additionId, date, amount: reset ? Math.max(0, amount) : amount, ...(reset ? { reset: true } : {}) }]
                : [];
            })
          : [];
        const recurring = Array.isArray(pool.recurring)
          ? pool.recurring.flatMap((value): RecurringAddition[] => {
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
                    start_date: startDate,
                    cadence,
                    ...(isValidDate(endDate) ? { end_date: endDate } : {}),
                    ...(cadence === "YearlyNthWeekday"
                      ? { month, nth_weekday: nthWeekday!, weekday: weekday! }
                      : {}),
                  }]
                : [];
            })
          : [];
        const capCandidates = Array.isArray(pool.caps)
          ? pool.caps.flatMap((value): PoolCap[] => {
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
            })
          : [];
        const caps: PoolCap[] = [];
        for (const cap of capCandidates.sort((left, right) => left.start_date.localeCompare(right.start_date))) {
          const previous = caps.at(-1);
          if (!previous || (previous.end_date && previous.end_date < cap.start_date)) caps.push(cap);
        }
        return [{ id, name, additions, recurring, caps,
          ...(pool.hidden_from_graph === true ? { hidden_from_graph: true } : {}),
          ...(pool.hidden_from_total === true ? { hidden_from_total: true } : {}),
        }];
      })
    : [];
  const events = Array.isArray(source.events)
    ? source.events
        .map(normalizeEvent)
        .filter((event): event is LeaveEvent => event !== null)
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

  return { pools, events, next_id: Math.max(storedNextId, largestId + 1, 1) };
}

export function serializeStoreJson(store: Store): string {
  return JSON.stringify(store, null, 2);
}

export function parseStoreJson(json: string): Store {
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

  return normalizeStore(source);
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
  const ledgers = store.pools.map((pool) => poolLedgerForDates(pool, store.events, [date])[0]);
  const accrued = ledgers.reduce((total, ledger) => total + (ledger?.accrued ?? 0), 0);
  const used = ledgers.reduce((total, ledger) => total + (ledger?.used ?? 0), 0);
  const balance = ledgers.reduce((total, ledger, index) => total + (store.pools[index].hidden_from_total ? 0 : ledger?.balance ?? 0), 0);
  return { accrued, used, balance };
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

export function eventBalanceWarnings(store: Store, days: LeaveDay[]): Array<{ poolId: number; date: string; balance: number }> {
  const firstDate = sortDays(days)[0]?.date;
  if (!firstDate) return [];
  const events = [...store.events, { id: store.next_id, name: "Event preview", days }];
  const affectedPoolIds = new Set(days.flatMap((day) => day.allocations.map((allocation) => allocation.pool_id)));
  const dates = [...new Set(events.flatMap((event) => event.days.map((day) => day.date)))].filter((date) => date >= firstDate).sort();
  return store.pools.filter((pool) => affectedPoolIds.has(pool.id)).flatMap((pool) => {
    const balances = poolLedgerForDates(pool, events, dates);
    const index = balances.findIndex((ledger) => ledger.balance < 0);
    return index < 0 ? [] : [{ poolId: pool.id, date: dates[index], balance: balances[index].balance }];
  });
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

export function balanceHistory(store: Store, today: string, poolId?: number): BalancePoint[] {
  if (!isValidDate(today)) return [];
  const pools = poolId === undefined
    ? store.pools.filter((pool) => !pool.hidden_from_graph)
    : store.pools.filter((pool) => pool.id === poolId);
  const poolIds = new Set(pools.map((pool) => pool.id));
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
  const start = earliestDate;
  const end = `${Number(today.slice(0, 4)) + 1}-12-31`;
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    dates.push(date);
  }
  const ledgers = pools.map((pool) => poolLedgerForDates(pool, store.events, dates));
  return dates.map((date, index) => ({
    date,
    balance: ledgers.reduce((total, ledger) => total + (ledger[index]?.balance ?? 0), 0),
    projected: date > today,
  }));
}

interface PoolLedgerSnapshot {
  accrued: number;
  used: number;
  balance: number;
}

interface PoolDailyActions {
  accrued: number;
  used: number;
  reset?: number;
}

function poolLedgerForDates(pool: Pool, events: LeaveEvent[], dates: string[]): PoolLedgerSnapshot[] {
  if (pool.caps.length === 0 && !pool.additions.some((addition) => addition.reset) && !pool.recurring.some((rule) => rule.reset)) {
    return dates.map((date) => {
      if (!isValidDate(date)) return { accrued: 0, used: 0, balance: 0 };
      const oneTime = pool.additions
        .filter((addition) => addition.date <= date)
        .reduce((total, addition) => total + addition.amount, 0);
      const recurring = pool.recurring.reduce(
        (total, rule) => total + rule.amount * recurringOccurrencesThrough(rule, date),
        0,
      );
      const accrued = oneTime + recurring;
      const used = events.reduce(
        (total, event) => total + eventHoursFromPoolThrough(event, pool.id, date),
        0,
      );
      return { accrued, used, balance: accrued - used };
    });
  }

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

  for (const addition of pool.additions) {
    if (isValidDate(addition.date) && addition.date <= throughDate) {
      if (addition.reset) actionForDate(addition.date).reset = addition.amount;
      else actionForDate(addition.date).accrued += addition.amount;
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
      else actionForDate(occurrenceDate).accrued += rule.amount;
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
  return dates.map((date) => {
    while (actionIndex < orderedActions.length && orderedActions[actionIndex]![0] <= date) {
      const [actionDate, daily] = orderedActions[actionIndex]!;
      const activeCap = pool.caps.find(
        (cap) => cap.start_date <= actionDate && (!cap.end_date || actionDate <= cap.end_date),
      );
      // Cap each credit when posted; same-day leave use is applied after accrual.
      const acceptedAccrual = activeCap
        ? Math.min(daily.accrued, Math.max(0, activeCap.max_balance - balance))
        : daily.accrued;
      balance += acceptedAccrual - daily.used;
      accrued += acceptedAccrual;
      used += daily.used;
      // Reset dates replace the remaining balance at the end of the day.
      if (daily.reset !== undefined) balance = daily.reset;
      actionIndex += 1;
    }
    return { accrued, used, balance };
  });
}
