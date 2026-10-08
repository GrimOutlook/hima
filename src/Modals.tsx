import { useState, type FormEvent, type ReactNode } from "react";
import { CalendarPicker } from "./CalendarPicker";
import {
  addDays,
  capRangesOverlap,
  freshEventDays,
  formatHours,
  isValidDate,
  MONTH_NAMES,
  NTH_WEEKDAYS,
  parseHours,
  eventBalanceWarnings,
  prettyDate,
  sortDays,
  todayDate,
  WEEKDAYS,
  type Cadence,
  type EventDayInput,
  type LeaveDay,
  type LeaveEvent,
  type NthWeekday,
  type Pool,
  type PoolCap,
  type Store,
  type Weekday,
} from "./model";

interface ModalFrameProps {
  icon: string;
  iconClass?: string;
  title: string;
  description: string;
  labelledBy: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}

export function ModalFrame({
  icon,
  iconClass = "",
  title,
  description,
  labelledBy,
  onClose,
  className = "",
  children,
}: ModalFrameProps) {
  return (
    <div className="modal-backdrop">
      <section className={className ? `modal-card ${className}` : "modal-card"} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <div className="modal-header">
          <div className={`modal-icon ${iconClass}`}>{icon}</div>
          <div className="modal-heading">
            <h2 id={labelledBy}>{title}</h2>
            <p>{description}</p>
          </div>
          <button className="icon-button modal-close" type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

interface PoolModalProps {
  editing: boolean;
  initialName?: string;
  initialDate?: string;
  initialCaps?: PoolCap[];
  initialHiddenFromGraph?: boolean;
  initialHiddenFromTotal?: boolean;
  onClose: () => void;
  onSave: (name: string, openingAmount: string, openingDate: string, caps: PoolCapFormData[], hiddenFromGraph: boolean, hiddenFromTotal: boolean) => string | null;
}

export interface PoolCapFormData {
  id?: number;
  max_balance: number;
  start_date: string;
  end_date?: string;
}

interface PoolCapDraft {
  id?: number;
  maxBalance: string;
  startDate: string;
  endDate: string;
}

export function PoolModal({
  editing,
  initialName = "",
  initialDate = todayDate(),
  initialCaps = [],
  initialHiddenFromGraph = false,
  initialHiddenFromTotal = false,
  onClose,
  onSave,
}: PoolModalProps) {
  const [name, setName] = useState(initialName);
  const [hiddenFromGraph, setHiddenFromGraph] = useState(initialHiddenFromGraph);
  const [hiddenFromTotal, setHiddenFromTotal] = useState(initialHiddenFromTotal);
  const [openingAmount, setOpeningAmount] = useState("");
  const [openingDate, setOpeningDate] = useState(initialDate);
  const [caps, setCaps] = useState<PoolCapDraft[]>(() => initialCaps.map((cap) => ({
    id: cap.id,
    maxBalance: String(cap.max_balance),
    startDate: cap.start_date,
    endDate: cap.end_date ?? "",
  })));
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Add a name for this pool.");
      return;
    }
    if (!editing && openingAmount.trim() !== "" && parseHours(openingAmount, true) === null) {
      setError("Enter a starting balance with up to two decimal places.");
      return;
    }
    if (!editing && !isValidDate(openingDate)) {
      setError("Choose a valid starting date.");
      return;
    }
    const savedCaps: PoolCapFormData[] = [];
    for (const cap of caps) {
      if (cap.maxBalance.trim() === "") {
        setError("Enter a maximum balance for each cap.");
        return;
      }
      const maxBalance = parseHours(cap.maxBalance, true);
      if (maxBalance === null) {
        setError("Enter cap balances with up to two decimal places.");
        return;
      }
      if (!isValidDate(cap.startDate) || (cap.endDate !== "" && !isValidDate(cap.endDate))) {
        setError("Choose a valid start date and, if provided, end date for each cap.");
        return;
      }
      if (cap.endDate && cap.endDate < cap.startDate) {
        setError("A cap's end date must be on or after its start date.");
        return;
      }
      savedCaps.push({
        ...(cap.id !== undefined ? { id: cap.id } : {}),
        max_balance: maxBalance,
        start_date: cap.startDate,
        ...(cap.endDate ? { end_date: cap.endDate } : {}),
      });
    }
    if (capRangesOverlap(savedCaps)) {
      setError("Cap date ranges must not overlap.");
      return;
    }
    const saveError = onSave(trimmedName, openingAmount, openingDate, savedCaps, hiddenFromGraph, hiddenFromTotal);
    if (saveError) setError(saveError);
  }

  return (
    <ModalFrame
      icon="◌"
      title={editing ? "Edit pool" : "Create a pool"}
      description={
        editing
          ? "Manage this pool's name, visibility, and balance caps. Its balance is calculated from additions and events."
          : "Give a kind of leave its own little home."
      }
      labelledBy="pool-modal-title"
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={submit}>
        <label className="field-label">
          Pool name
          <input
            type="text"
            placeholder="e.g. Personal leave"
            value={name}
            maxLength={48}
            autoFocus
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </label>
        {!editing && (
          <div className="form-two-columns">
            <label className="field-label">
              Starting balance
              <div className="input-with-suffix">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={openingAmount}
                  onChange={(event) => setOpeningAmount(event.currentTarget.value)}
                />
                <span>hours</span>
              </div>
            </label>
            <CalendarPicker label="Balance as of" value={openingDate} onChange={setOpeningDate} />
          </div>
        )}
        {editing && <div className="pool-caps-editor">
          <div className="pool-caps-heading">
            <div>
              <strong>Balance caps</strong>
              <p>Leave the end date blank for an ongoing cap. Extra accrual is discarded; leave usage can make room again.</p>
            </div>
          </div>
          {caps.length === 0 ? (
            <p className="no-rules">No caps configured.</p>
          ) : caps.map((cap, index) => (
            <div className="pool-cap-row" key={cap.id ?? `new-cap-${index}`}>
              <label className="field-label pool-cap-amount">
                Maximum balance
                <div className="input-with-suffix">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 80"
                    value={cap.maxBalance}
                    onChange={(event) => {
                      const maxBalance = event.currentTarget.value;
                      setCaps((current) => current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, maxBalance } : item,
                      ));
                    }}
                  />
                  <span>hours</span>
                </div>
              </label>
              <div className="pool-cap-start">
                <CalendarPicker label="Starts on"
                  value={cap.startDate}
                  onChange={(startDate) => {
                    setCaps((current) => current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, startDate } : item,
                    ));
                  }}
                />
              </div>
              <div className="pool-cap-end">
                <CalendarPicker label="Ends on (optional)" optional
                  min={cap.startDate || undefined}
                  value={cap.endDate}
                  onChange={(endDate) => {
                    setCaps((current) => current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, endDate } : item,
                    ));
                  }}
                />
              </div>
              <button
                className="icon-button pool-cap-remove"
                type="button"
                aria-label={`Remove balance cap ${index + 1}`}
                title="Remove cap"
                onClick={() => setCaps((current) => current.filter((_, itemIndex) => itemIndex !== index))}
              >
                ×
              </button>
            </div>
          ))}
        </div>}
        <fieldset className="pool-visibility-settings">
          <legend>Pool visibility</legend>
          <label><input type="checkbox" checked={hiddenFromGraph} onChange={(event) => setHiddenFromGraph(event.currentTarget.checked)} />Hide from combined graph</label>
          <label><input type="checkbox" checked={hiddenFromTotal} onChange={(event) => setHiddenFromTotal(event.currentTarget.checked)} />Hide from overall balance total</label>
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button className="button button-quiet" type="button" onClick={onClose}>Cancel</button>
          <button className="button button-primary" type="submit">
            {editing ? "Save changes" : "Create pool"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

interface PoolUsageModalProps {
  pool: Pick<Pool, "id" | "name">;
  events: LeaveEvent[];
  onClose: () => void;
}

export function PoolUsageModal({ pool, events, onClose }: PoolUsageModalProps) {
  const usageByEventDay = new Map<string, { eventId: number; eventName: string; date: string; hours: number }>();
  for (const event of events) {
    for (const day of event.days) {
      const hours = day.allocations
        .filter((allocation) => allocation.pool_id === pool.id)
        .reduce((total, allocation) => total + allocation.hours, 0);
      if (hours === 0) continue;
      const key = `${event.id}:${day.date}`;
      const existing = usageByEventDay.get(key);
      if (existing) {
        existing.hours += hours;
      } else {
        usageByEventDay.set(key, { eventId: event.id, eventName: event.name, date: day.date, hours });
      }
    }
  }
  const usageEntries = [...usageByEventDay.values()].sort(
    (left, right) => left.date.localeCompare(right.date) || left.eventName.localeCompare(right.eventName),
  );
  const totalUsageHours = usageEntries.reduce((total, entry) => total + entry.hours, 0);

  return (
    <ModalFrame
      icon="▤"
      iconClass="modal-icon-ledger"
      title={`${pool.name} usage`}
      description="Dates, events, and hours allocated from this pool."
      labelledBy={`pool-usage-modal-title-${pool.id}`}
      onClose={onClose}
      className="pool-usage-modal"
    >
      {usageEntries.length === 0 ? (
        <p className="pool-usage-modal-empty">No event days are allocated to this pool yet.</p>
      ) : (
        <div className="pool-usage-modal-table-scroll">
          <table className="pool-usage-table">
            <thead>
              <tr><th scope="col">Date</th><th scope="col">Event</th><th scope="col">Hours</th></tr>
            </thead>
            <tbody>
              {usageEntries.map((entry) => (
                <tr key={`${entry.eventId}-${entry.date}`}>
                  <td><time dateTime={entry.date}>{prettyDate(entry.date)}</time></td>
                  <td title={entry.eventName}>{entry.eventName}</td>
                  <td>{formatHours(entry.hours)} h</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th scope="row" colSpan={2}>Total allocated</th><td>{formatHours(totalUsageHours)} h</td></tr>
            </tfoot>
          </table>
        </div>
      )}
      <div className="modal-actions">
        <button className="button button-quiet" type="button" onClick={onClose}>Done</button>
      </div>
    </ModalFrame>
  );
}

export interface AdditionFormData {
  reset: boolean;
  amount: number;
  date: string;
  recurring: boolean;
  cadence: Cadence;
  endDate?: string;
  month?: number;
  nthWeekday?: NthWeekday;
  weekday?: Weekday;
}

interface AdditionModalProps {
  onSaveCap?: (cap: PoolCapFormData) => string | null;
  initialReset?: boolean;
  poolName: string;
  mode: "add" | "edit-one-time" | "edit-recurring";
  initialAmount?: string;
  initialDate?: string;
  initialEndDate?: string;
  initialCadence?: Cadence;
  initialMonth?: number;
  initialNthWeekday?: NthWeekday;
  initialWeekday?: Weekday;
  onClose: () => void;
  onSave: (addition: AdditionFormData) => string | null;
}

export function AdditionModal({
  onSaveCap,
  initialReset = false,
  poolName,
  mode,
  initialAmount = "",
  initialDate = todayDate(),
  initialEndDate = "",
  initialCadence = "Fortnightly",
  initialMonth = Number(todayDate().slice(5, 7)),
  initialNthWeekday = "First",
  initialWeekday = "Friday",
  onClose,
  onSave,
}: AdditionModalProps) {
  const adding = mode === "add";
  const [reset, setReset] = useState(initialReset);
  const [cap, setCap] = useState(false);
  const [amount, setAmount] = useState(initialAmount);
  const [date, setDate] = useState(initialDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [recurring, setRecurring] = useState(mode === "edit-recurring");
  const [cadence, setCadence] = useState<Cadence>(initialCadence);
  const [month, setMonth] = useState(initialMonth);
  const [nthWeekday, setNthWeekday] = useState<NthWeekday>(initialNthWeekday);
  const [weekday, setWeekday] = useState<Weekday>(initialWeekday);
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cap && onSaveCap) {
      const maxBalance = parseHours(amount, true);
      if (amount.trim() === "" || maxBalance === null) {
        setError("Enter a maximum balance of zero or more with up to two decimal places.");
        return;
      }
      if (!isValidDate(date) || (endDate && !isValidDate(endDate))) {
        setError("Choose a valid start date and, if provided, end date.");
        return;
      }
      if (endDate && endDate < date) {
        setError("A cap's end date must be on or after its start date.");
        return;
      }
      const saveError = onSaveCap({ max_balance: maxBalance, start_date: date, ...(endDate ? { end_date: endDate } : {}) });
      if (saveError) setError(saveError);
      return;
    }
    const parsedAmount = reset && amount.trim() === "" ? 0 : parseHours(amount, reset);
    if (parsedAmount === null) {
      setError(reset
        ? "Enter a reset balance of zero or more with up to two decimal places."
        : "Enter an amount greater than zero with up to two decimal places.");
      return;
    }
    if (!isValidDate(date)) {
      setError("Choose a valid date.");
      return;
    }
    if (
      recurring &&
      cadence === "YearlyNthWeekday" &&
      (!Number.isInteger(month) || month < 1 || month > 12 || !nthWeekday || !weekday)
    ) {
      setError("Choose a valid occurrence, weekday, and month.");
      return;
    }
    if (recurring && endDate && !isValidDate(endDate)) {
      setError("Choose a valid end date.");
      return;
    }
    if (recurring && endDate && endDate < date) {
      setError("The end date must be on or after the schedule's start date.");
      return;
    }
    const saveError = onSave({
      reset,
      amount: parsedAmount,
      date,
      recurring,
      cadence,
      ...(recurring && endDate ? { endDate } : {}),
      ...(recurring && cadence === "YearlyNthWeekday" ? { month, nthWeekday, weekday } : {}),
    });
    if (saveError) setError(saveError);
  }

  const title = cap ? `Add balance cap to ${poolName}` : adding
    ? `Add ${reset ? "use-by date" : "time"} to ${poolName}`
    : `Edit ${reset ? "use-by date" : "addition"} in ${poolName}`;

  return (
    <ModalFrame
      icon="+"
      iconClass="modal-icon-add"
      title={title}
      description={
        cap
          ? "Limit the balance from accrual. Leave the end date blank for an ongoing cap; leave usage can make room again."
          : reset
          ? "Set the balance to your chosen amount at the end of each reset date, after additions and leave usage."
          : adding
          ? "Choose a one-time addition or set a repeating schedule."
          : "Update this addition's amount, date, or schedule."
      }
      labelledBy="addition-modal-title"
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={submit}>
        <div className="segmented-control" role="group" aria-label="Action">
          {[
            { value: "add", label: "Add time" },
            { value: "reset", label: "Reset balance" },
            ...(adding && onSaveCap ? [{ value: "cap", label: "Balance cap" }] : []),
          ].map((action) => {
            const selected = action.value === (cap ? "cap" : reset ? "reset" : "add");
            return (
              <button
                key={action.value}
                className={selected ? "segment is-active" : "segment"}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setCap(action.value === "cap");
                  setReset(action.value === "reset");
                  setError("");
                }}
              >
                {action.label}
              </button>
            );
          })}
        </div>
        {adding && !cap && (
          <div className="segmented-control">
            <button
              className={!recurring ? "segment is-active" : "segment"}
              type="button"
              onClick={() => setRecurring(false)}
            >
              One-time
            </button>
            <button
              className={recurring ? "segment is-active" : "segment"}
              type="button"
              onClick={() => setRecurring(true)}
            >
              Repeating
            </button>
          </div>
        )}
        <label className="field-label">
          {cap ? "Maximum balance" : reset ? "Reset balance to" : "Time to add"}
          <div className="input-with-suffix">
            <input
              type="number"
              min={reset || cap ? "0" : "0.01"}
              step="0.01"
              placeholder={reset ? "0" : "e.g. 7.6"}
              value={amount}
              onChange={(event) => setAmount(event.currentTarget.value)}
            />
            <span>hours</span>
          </div>
        </label>
        {!cap && recurring && (
          <label className="field-label">
            Repeat every
            <select value={cadence} onChange={(event) => setCadence(event.currentTarget.value as Cadence)}>
              <option value="Weekly">Week</option>
              <option value="Fortnightly">Fortnight</option>
              <option value="Monthly">Month</option>
              <option value="Yearly">Year</option>
              <option value="YearlyNthWeekday">Nth weekday each year</option>
            </select>
          </label>
        )}
        {!cap && recurring && cadence === "YearlyNthWeekday" && (
          <div className="nth-weekday-fields">
            <label className="field-label">
              Occurrence
              <select value={nthWeekday} onChange={(event) => setNthWeekday(event.currentTarget.value as NthWeekday)}>
                {NTH_WEEKDAYS.map((occurrence) => <option key={occurrence} value={occurrence}>{occurrence}</option>)}
              </select>
            </label>
            <label className="field-label">
              Weekday
              <select value={weekday} onChange={(event) => setWeekday(event.currentTarget.value as Weekday)}>
                {WEEKDAYS.map((day) => <option key={day} value={day}>{day}</option>)}
              </select>
            </label>
            <label className="field-label nth-weekday-month">
              Month
              <select value={month} onChange={(event) => setMonth(Number(event.currentTarget.value))}>
                {MONTH_NAMES.map((monthName, index) => (
                  <option key={monthName} value={index + 1}>{monthName}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        <CalendarPicker label={cap ? "Starts on" : recurring
             ? cadence === "YearlyNthWeekday" ? "Start schedule on" : reset ? "First use-by date" : "First addition on"
              : reset ? "Use-by date" : "Add on"} value={date} onChange={setDate} />
        {(cap || recurring) && (
            <CalendarPicker label="End date (inclusive, optional)" optional
              min={date}
              value={endDate}
              onChange={setEndDate}
            />
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button className="button button-quiet" type="button" onClick={onClose}>Cancel</button>
          <button className="button button-primary" type="submit">
            {cap ? "Save balance cap" : adding ? reset ? "Save use-by date" : "Save addition" : "Save changes"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

interface EventModalProps {
  pools: Pool[];
  store: Store;
  editing: boolean;
  initialName?: string;
  initialDays?: EventDayInput[];
  onClose: () => void;
  onSave: (name: string, days: LeaveDay[]) => string | null;
}

export function EventModal({
  pools,
  store,
  editing,
  initialName = "",
  initialDays,
  onClose,
  onSave,
}: EventModalProps) {
  const [defaultPoolId, setDefaultPoolId] = useState(pools[0]?.id ?? 0);
  const [defaultHours, setDefaultHours] = useState("");
  const [name, setName] = useState(initialName);
  const [days, setDays] = useState<EventDayInput[]>(initialDays ?? freshEventDays(defaultPoolId));
  const [error, setError] = useState("");

  const [step, setStep] = useState(1);
  const [reviewDays, setReviewDays] = useState<LeaveDay[]>([]);

  function selectDates(dates: string[]) {
    setDays((current) => dates.map((date) => current.find((day) => day.date === date) ?? {
      date, allocations: [{ pool_id: defaultPoolId, hours: defaultHours }],
    }));
    setError("");
  }

  function changeDefaultHours(hours: string) {
    setDays((current) => current.map((day) =>
      day.allocations.length === 1 && day.allocations[0].hours === defaultHours
        ? { ...day, allocations: [{ ...day.allocations[0], hours }] }
        : day,
    ));
    setDefaultHours(hours);
    setError("");
  }

  function changeDefaultPool(poolId: number) {
    setDays((current) => current.map((day) =>
      day.allocations.length === 1 && day.allocations[0].pool_id === defaultPoolId
        ? { ...day, allocations: [{ ...day.allocations[0], pool_id: poolId }] }
        : day,
    ));
    setDefaultPoolId(poolId);
    setError("");
  }

  function updateDay(dayIndex: number, update: (day: EventDayInput) => EventDayInput) {
    setDays((current) => current.map((day, index) => index === dayIndex ? update(day) : day));
  }

  function updateAllocation(
    dayIndex: number,
    allocationIndex: number,
    update: (allocation: EventDayInput["allocations"][number]) => EventDayInput["allocations"][number],
  ) {
    updateDay(dayIndex, (day) => ({
      ...day,
      allocations: day.allocations.map((allocation, index) =>
        index === allocationIndex ? update(allocation) : allocation,
      ),
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Give this event a name.");
      return;
    }
    if (days.length === 0) {
      setError("Add at least one day to this event.");
      return;
    }
    if (!editing && step === 1) {
      setError("");
      setStep(2);
      return;
    }

    const uniqueDates = new Set<string>();
    const savedDays: LeaveDay[] = [];
    for (const day of days) {
      if (!isValidDate(day.date)) {
        setError("Choose a valid date for each event day.");
        return;
      }
      if (uniqueDates.has(day.date)) {
        setError("Each event day must have a different date.");
        return;
      }
      uniqueDates.add(day.date);
      if (day.allocations.length === 0) {
        setError("Choose at least one pool for each event day.");
        return;
      }
      const uniquePools = new Set<number>();
      const allocations = [];
      for (const allocation of day.allocations) {
        if (uniquePools.has(allocation.pool_id)) {
          setError("Choose each pool only once per day.");
          return;
        }
        uniquePools.add(allocation.pool_id);
        if (!pools.some((pool) => pool.id === allocation.pool_id)) {
          setError("Choose an existing pool for each event day.");
          return;
        }
        const hours = parseHours(allocation.hours);
        if (hours === null) {
          setError("Enter positive hours with up to two decimal places for each pool allocation.");
          return;
        }
        allocations.push({ pool_id: allocation.pool_id, hours });
      }
      savedDays.push({ date: day.date, allocations });
    }

    if (!editing && step === 2) {
      setReviewDays(sortDays(savedDays));
      setError("");
      setStep(3);
      return;
    }
    const saveError = onSave(trimmedName, sortDays(savedDays));
    if (saveError) setError(saveError);
  }

  function addDay() {
    const lastDay = days.at(-1);
    const date = lastDay ? addDays(lastDay.date, 1) : todayDate();
    const poolId = lastDay?.allocations[0]?.pool_id ?? defaultPoolId;
    setDays((current) => [
      ...current,
      { date, allocations: [{ pool_id: poolId, hours: "" }] },
    ]);
  }

  const warnings = step === 3 && !editing ? eventBalanceWarnings(store, reviewDays).map((warning) =>
    `${pools.find((pool) => pool.id === warning.poolId)?.name} is projected to have ${formatHours(warning.balance)} h on ${prettyDate(warning.date)}, including this event and other planned leave.`,
  ) : [];

  return (
    <ModalFrame
      icon="↘"
      iconClass="modal-icon-event"
      title={editing ? "Edit planned leave" : "Plan some leave"}
      description={
        editing
          ? "Update dates, hours, or the source pool for any day."
          : step === 1 ? "Name your event and choose its dates."
          : step === 2 ? "Choose the hours and source pools for each date."
          : "Review your event and its projected impact before adding it."
      }
      labelledBy="event-modal-title"
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={submit}>
        {!editing && <ol className="event-wizard-steps" aria-label="Event creation progress">
          {["Name & dates", "Hours & pools", "Overview"].map((title, index) => <li key={title} aria-current={step === index + 1 ? "step" : undefined} className={step === index + 1 ? "is-active" : ""}>{index + 1}. {title}</li>)}
        </ol>}
        {(editing || step === 1) && <>
        <label className="field-label">
          Event name
          <input
            type="text"
            placeholder="e.g. A long weekend"
            value={name}
            maxLength={64}
            autoFocus
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </label>
        {!editing && <>
          <CalendarPicker label="Event dates" value="" onChange={() => {}} selectedDates={days.map((day) => day.date)} onDatesChange={selectDates} />
          <p className="wizard-hint">Click dates or drag to select a range. Start on a selected date to deselect a range. You can choose dates across multiple months.</p>
          <ul className="event-selected-dates">{days.map((day) => <li key={day.date}><time dateTime={day.date}>{prettyDate(day.date)}</time><button type="button" className="icon-button" aria-label={`Remove ${prettyDate(day.date)}`} onClick={() => selectDates(days.filter((item) => item.date !== day.date).map((item) => item.date))}>×</button></li>)}</ul>
        </>}
        </>}
        {!editing && step <= 2 && <>
          <div className="form-two-columns">
            <label className="field-label">
              Default hours
              <div className="input-with-suffix">
                <input type="number" min="0.01" step="0.01" placeholder="e.g. 7.6" value={defaultHours} onChange={(event) => changeDefaultHours(event.currentTarget.value)} />
                <span>hours</span>
              </div>
            </label>
            <label className="field-label">
              Default pool
              <select value={defaultPoolId} onChange={(event) => changeDefaultPool(Number(event.currentTarget.value))}>
                {pools.map((pool) => <option key={pool.id} value={pool.id}>{pool.name}</option>)}
              </select>
            </label>
          </div>
          <p className="wizard-hint">Defaults apply to each selected date. You can adjust individual days in Hours &amp; pools; split allocations keep their own values.</p>
        </>}
        {(editing || step === 2) && <>
        <div className="event-days-editor">
          <div className="event-days-heading">
            <span>Days covered</span>
            <span>Hours are recorded per day</span>
          </div>
          {days.map((day, dayIndex) => {
            const availablePool = pools.find(
              (pool) => !day.allocations.some((allocation) => allocation.pool_id === pool.id),
            );
            const canAddPool = day.allocations.length < pools.length;
            return (
              <div className="event-day-card" key={dayIndex}>
                <div className="event-day-header">
                  {editing ? (
                    <CalendarPicker label="Date"
                      value={day.date}
                      onChange={(date) => {
                        updateDay(dayIndex, (current) => ({ ...current, date }));
                      }}
                    />
                  ) : <strong>{prettyDate(day.date)}</strong>}
                  {editing && days.length > 1 && (
                    <button
                      className="icon-button event-day-remove"
                      type="button"
                      title="Remove day"
                      aria-label="Remove event day"
                      onClick={() => setDays((current) => current.filter((_, index) => index !== dayIndex))}
                    >
                      ×
                    </button>
                  )}
                </div>
                <div className="event-allocations">
                  {day.allocations.map((allocation, allocationIndex) => (
                    <div className="event-allocation-row" key={`${dayIndex}-${allocationIndex}`}>
                      <label className="field-label">
                        Pool
                        <select
                          value={allocation.pool_id}
                          onChange={(event) => {
                            const poolId = Number(event.currentTarget.value);
                            updateAllocation(dayIndex, allocationIndex, (current) => ({ ...current, pool_id: poolId }));
                          }}
                        >
                          {pools.map((pool) => <option key={pool.id} value={pool.id}>{pool.name}</option>)}
                        </select>
                      </label>
                      <label className="field-label">
                        Hours
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="e.g. 3.5"
                          value={allocation.hours}
                          onChange={(event) => {
                            const hours = event.currentTarget.value;
                            updateAllocation(dayIndex, allocationIndex, (current) => ({ ...current, hours }));
                          }}
                        />
                      </label>
                      {day.allocations.length > 1 && (
                        <button
                          className="icon-button allocation-remove"
                          type="button"
                          title="Remove pool allocation"
                          aria-label="Remove pool allocation"
                          onClick={() => updateDay(dayIndex, (current) => ({
                            ...current,
                            allocations: current.allocations.filter((_, index) => index !== allocationIndex),
                          }))}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {canAddPool && availablePool && (
                    <button
                      className="button button-soft button-small add-day-button"
                      type="button"
                      onClick={() => updateDay(dayIndex, (current) => ({
                        ...current,
                        allocations: [...current.allocations, { pool_id: availablePool.id, hours: "" }],
                      }))}
                    >
                      <span className="button-plus">+</span>
                      Split this day across another pool
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {editing && <button className="button button-soft button-small add-day-button" type="button" onClick={addDay}>
            <span className="button-plus">+</span>
            Add another day
          </button>}
        </div>
        </>}
        {!editing && step === 3 && <section className="event-review" aria-label="Event overview">
          <h3>{name.trim()}</h3>
          <p>{reviewDays.length} {reviewDays.length === 1 ? "day" : "days"} · {formatHours(reviewDays.reduce((total, day) => total + day.allocations.reduce((sum, allocation) => sum + allocation.hours, 0), 0))} hours total</p>
          {reviewDays.map((day) => <div className="event-day-card" key={day.date}>
            <strong>{prettyDate(day.date)}</strong>
            {day.allocations.map((allocation) => <div className="event-review-allocation" key={allocation.pool_id}><span>{pools.find((pool) => pool.id === allocation.pool_id)?.name}</span><strong>{formatHours(allocation.hours)} h</strong></div>)}
          </div>)}
          <div className={warnings.length ? "event-review-warnings" : "event-review-clear"}>
            <strong>{warnings.length ? "Balance warnings" : "No negative pool balances projected"}</strong>
            {warnings.length > 0 && <><ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul><p>You can still add this event, or go back to adjust the allocations.</p></>}
          </div>
        </section>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button className="button button-quiet" type="button" onClick={onClose}>Cancel</button>
          {!editing && step > 1 && <button className="button button-quiet" type="button" onClick={() => { setStep(step - 1); setError(""); }}>Back</button>}
          <button className="button button-primary" type="submit">
            {editing ? "Save changes" : step === 1 ? "Next: hours & pools" : step === 2 ? "Review event" : "Add to plan"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

export function eventInputDays(days: LeaveDay[]): EventDayInput[] {
  return days.map((day) => ({
    date: day.date,
    allocations: day.allocations.map((allocation) => ({
      pool_id: allocation.pool_id,
      hours: String(allocation.hours),
    })),
  }));
}
