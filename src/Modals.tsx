import { useState, type FormEvent, type ReactNode } from "react";
import {
  addDays,
  freshEventDays,
  isValidDate,
  parseHours,
  sortDays,
  todayDate,
  type Cadence,
  type EventDayInput,
  type LeaveDay,
  type Pool,
} from "./model";

interface ModalFrameProps {
  icon: string;
  iconClass?: string;
  title: string;
  description: string;
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
}

function ModalFrame({
  icon,
  iconClass = "",
  title,
  description,
  labelledBy,
  onClose,
  children,
}: ModalFrameProps) {
  return (
    <div className="modal-backdrop">
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
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
  onClose: () => void;
  onSave: (name: string, openingAmount: string, openingDate: string) => string | null;
}

export function PoolModal({
  editing,
  initialName = "",
  initialDate = todayDate(),
  onClose,
  onSave,
}: PoolModalProps) {
  const [name, setName] = useState(initialName);
  const [openingAmount, setOpeningAmount] = useState("");
  const [openingDate, setOpeningDate] = useState(initialDate);
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
    const saveError = onSave(trimmedName, openingAmount, openingDate);
    if (saveError) setError(saveError);
  }

  return (
    <ModalFrame
      icon="◌"
      title={editing ? "Edit pool" : "Create a pool"}
      description={
        editing
          ? "Rename this pool. Its balance is calculated from its additions and events."
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
            <label className="field-label">
              Balance as of
              <input
                type="date"
                value={openingDate}
                onChange={(event) => setOpeningDate(event.currentTarget.value)}
              />
            </label>
          </div>
        )}
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

export interface AdditionFormData {
  amount: number;
  date: string;
  recurring: boolean;
  cadence: Cadence;
}

interface AdditionModalProps {
  poolName: string;
  mode: "add" | "edit-one-time" | "edit-recurring";
  initialAmount?: string;
  initialDate?: string;
  initialCadence?: Cadence;
  onClose: () => void;
  onSave: (addition: AdditionFormData) => string | null;
}

export function AdditionModal({
  poolName,
  mode,
  initialAmount = "",
  initialDate = todayDate(),
  initialCadence = "Fortnightly",
  onClose,
  onSave,
}: AdditionModalProps) {
  const adding = mode === "add";
  const [amount, setAmount] = useState(initialAmount);
  const [date, setDate] = useState(initialDate);
  const [recurring, setRecurring] = useState(mode === "edit-recurring");
  const [cadence, setCadence] = useState<Cadence>(initialCadence);
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = parseHours(amount);
    if (parsedAmount === null) {
      setError("Enter an amount greater than zero with up to two decimal places.");
      return;
    }
    if (!isValidDate(date)) {
      setError("Choose a valid date.");
      return;
    }
    const saveError = onSave({ amount: parsedAmount, date, recurring, cadence });
    if (saveError) setError(saveError);
  }

  const title = adding
    ? `Add time to ${poolName}`
    : `Edit addition in ${poolName}`;

  return (
    <ModalFrame
      icon="+"
      iconClass="modal-icon-add"
      title={title}
      description={
        adding
          ? "Choose a one-time addition or set a repeating schedule."
          : "Update this addition's amount, date, or schedule."
      }
      labelledBy="addition-modal-title"
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={submit}>
        {adding && (
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
          Time to add
          <div className="input-with-suffix">
            <input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="e.g. 7.6"
              value={amount}
              onChange={(event) => setAmount(event.currentTarget.value)}
            />
            <span>hours</span>
          </div>
        </label>
        {recurring && (
          <label className="field-label">
            Repeat every
            <select value={cadence} onChange={(event) => setCadence(event.currentTarget.value as Cadence)}>
              <option value="Weekly">Week</option>
              <option value="Fortnightly">Fortnight</option>
              <option value="Monthly">Month</option>
              <option value="Yearly">Year</option>
            </select>
          </label>
        )}
        <label className="field-label">
          {recurring ? "First addition on" : "Add on"}
          <input type="date" value={date} onChange={(event) => setDate(event.currentTarget.value)} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button className="button button-quiet" type="button" onClick={onClose}>Cancel</button>
          <button className="button button-primary" type="submit">
            {adding ? "Save addition" : "Save changes"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

interface EventModalProps {
  pools: Pool[];
  editing: boolean;
  initialName?: string;
  initialDays?: EventDayInput[];
  onClose: () => void;
  onSave: (name: string, days: LeaveDay[]) => string | null;
}

export function EventModal({
  pools,
  editing,
  initialName = "",
  initialDays,
  onClose,
  onSave,
}: EventModalProps) {
  const defaultPoolId = pools[0]?.id ?? 0;
  const [name, setName] = useState(initialName);
  const [days, setDays] = useState<EventDayInput[]>(initialDays ?? freshEventDays(defaultPoolId));
  const [error, setError] = useState("");

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

  return (
    <ModalFrame
      icon="↘"
      iconClass="modal-icon-event"
      title={editing ? "Edit planned leave" : "Plan some leave"}
      description={
        editing
          ? "Update dates, hours, or the source pool for any day."
          : "Record the hours and source pool for each day."
      }
      labelledBy="event-modal-title"
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={submit}>
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
                  <label className="field-label">
                    Date
                    <input
                      type="date"
                      value={day.date}
                      onChange={(event) => {
                        const date = event.currentTarget.value;
                        updateDay(dayIndex, (current) => ({ ...current, date }));
                      }}
                    />
                  </label>
                  {days.length > 1 && (
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
          <button className="button button-soft button-small add-day-button" type="button" onClick={addDay}>
            <span className="button-plus">+</span>
            Add another day
          </button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button className="button button-quiet" type="button" onClick={onClose}>Cancel</button>
          <button className="button button-primary" type="submit">
            {editing ? "Save changes" : "Add to plan"}
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
