import { useEffect, useMemo, useState } from "react";
import { BalanceChart } from "./BalanceChart";
import { CalendarPicker } from "./CalendarPicker";
import {
  AdditionModal,
  EventModal,
  PoolModal,
  eventInputDays,
  type AdditionFormData,
  type PoolCapFormData,
} from "./Modals";
import {
  allocateIds,
  balanceHistory,
  dayLabel,
  eventDateRangeLabel,
  eventDaySummary,
  eventPoolSummary,
  eventTotalHours,
  formatHours,
  freshEventDays,
  loadStore,
  monthLabel,
  parseHours,
  poolBalanceOn,
  poolTotalsOn,
  prettyDate,
  recurringScheduleDescription,
  saveStore,
  todayDate,
  totalsOn,
  type EventDayInput,
  type LeaveDay,
  type LeaveEvent,
  type OneTimeAddition,
  type Pool,
  type Store,
} from "./model";

type ModalState =
  | { type: "new-pool" }
  | { type: "edit-pool"; poolId: number }
  | { type: "add-time"; poolId: number }
  | { type: "edit-addition"; poolId: number; additionId: number }
  | { type: "edit-recurring"; poolId: number; ruleId: number }
  | { type: "new-event"; initialDays: EventDayInput[] }
  | { type: "edit-event"; eventId: number; name: string; days: EventDayInput[] };

function App() {
  const [store, setStore] = useState<Store>(loadStore);
  const [balanceDate, setBalanceDate] = useState(todayDate);
  const [modal, setModal] = useState<ModalState | null>(null);
  const chartHistoryEnd = todayDate();
  const balance = totalsOn(store, balanceDate);
  const history = useMemo(
    () => balanceHistory(store, chartHistoryEnd),
    [store, chartHistoryEnd],
  );
  const firstPoolId = store.pools[0]?.id;
  const timeline = [...store.events].sort((left, right) =>
    left.days[0]?.date.localeCompare(right.days[0]?.date ?? "") ?? 0,
  );
  const selectedModal = modal;

  useEffect(() => {
    saveStore(store);
  }, [store]);

  function createPool() {
    setModal({ type: "new-pool" });
  }

  function createEvent() {
    if (firstPoolId !== undefined) {
      setModal({ type: "new-event", initialDays: freshEventDays(firstPoolId) });
    }
  }

  function removePool(poolId: number, poolName: string) {
    if (!window.confirm(`Remove ‘${poolName}’ and event days assigned to it?`)) return;
    setStore((current) => {
      const events = current.events
        .map((event) => ({
          ...event,
          days: event.days
            .map((day) => ({
              ...day,
              allocations: day.allocations.filter((allocation) => allocation.pool_id !== poolId),
            }))
            .filter((day) => day.allocations.length > 0),
        }))
        .filter((event) => event.days.length > 0);
      return {
        ...current,
        pools: current.pools.filter((pool) => pool.id !== poolId),
        events,
      };
    });
  }

  function removeAddition(poolId: number, additionId: number, recurring: boolean) {
    if (!window.confirm(recurring ? "Remove this recurring addition?" : "Remove this one-time addition?")) return;
    setStore((current) => ({
      ...current,
      pools: current.pools.map((pool) => {
        if (pool.id !== poolId) return pool;
        return recurring
          ? { ...pool, recurring: pool.recurring.filter((rule) => rule.id !== additionId) }
          : { ...pool, additions: pool.additions.filter((addition) => addition.id !== additionId) };
      }),
    }));
  }

  function savePool(
    name: string,
    openingAmount: string,
    openingDate: string,
    capFormData: PoolCapFormData[],
  ): string | null {
    if (selectedModal?.type === "edit-pool") {
      if (!store.pools.some((pool) => pool.id === selectedModal.poolId)) return "This pool no longer exists.";
      setStore((current) => {
        const newCapCount = capFormData.filter((cap) => cap.id === undefined).length;
        const ids = allocateIds(current, newCapCount);
        let nextCapId = ids.firstId;
        const caps = capFormData.map((cap) => ({
          ...cap,
          id: cap.id ?? nextCapId++,
        }));
        return {
          ...current,
          next_id: newCapCount > 0 ? ids.nextId : current.next_id,
          pools: current.pools.map((pool) =>
            pool.id === selectedModal.poolId ? { ...pool, name, caps } : pool,
          ),
        };
      });
    } else {
      const initialAmount = openingAmount.trim() === "" ? 0 : parseHours(openingAmount, true);
      if (initialAmount === null) return "Enter a starting balance with up to two decimal places.";
      setStore((current) => {
        const openingAdditionCount = initialAmount > 0 ? 1 : 0;
        const currentIds = allocateIds(current, 1 + openingAdditionCount + capFormData.length);
        const additions: OneTimeAddition[] = initialAmount > 0
          ? [{ id: currentIds.firstId + 1, amount: initialAmount, date: openingDate }]
          : [];
        const firstCapId = currentIds.firstId + 1 + openingAdditionCount;
        const caps = capFormData.map((cap, index) => ({ ...cap, id: firstCapId + index }));
        return {
          ...current,
          next_id: currentIds.nextId,
          pools: [...current.pools, { id: currentIds.firstId, name, additions, recurring: [], caps }],
        };
      });
    }
    setModal(null);
    return null;
  }

  function saveAddition(form: AdditionFormData): string | null {
    if (
      selectedModal?.type !== "add-time" &&
      selectedModal?.type !== "edit-addition" &&
      selectedModal?.type !== "edit-recurring"
    ) {
      return "This addition is no longer available.";
    }
    const poolId = selectedModal.poolId;
    if (!store.pools.some((pool) => pool.id === poolId)) return "This pool no longer exists.";
    if (
      selectedModal.type === "edit-addition" &&
      !store.pools.some((pool) =>
        pool.id === poolId && pool.additions.some((addition) => addition.id === selectedModal.additionId),
      )
    ) return "This addition no longer exists.";
    if (
      selectedModal.type === "edit-recurring" &&
      !store.pools.some((pool) =>
        pool.id === poolId && pool.recurring.some((rule) => rule.id === selectedModal.ruleId),
      )
    ) return "This addition no longer exists.";

    setStore((current) => {
      if (selectedModal.type === "add-time") {
        const ids = allocateIds(current);
        return {
          ...current,
          next_id: ids.nextId,
          pools: current.pools.map((pool) => {
            if (pool.id !== poolId) return pool;
            return form.recurring
              ? {
                  ...pool,
                  recurring: [
                    ...pool.recurring,
                    {
                      id: ids.firstId,
                      amount: form.amount,
                      cadence: form.cadence,
                      start_date: form.date,
                      ...(form.endDate ? { end_date: form.endDate } : {}),
                      ...(form.cadence === "YearlyNthWeekday"
                        ? {
                            month: form.month,
                            nth_weekday: form.nthWeekday,
                            weekday: form.weekday,
                          }
                        : {}),
                    },
                  ],
                }
              : {
                  ...pool,
                  additions: [...pool.additions, { id: ids.firstId, amount: form.amount, date: form.date }],
                };
          }),
        };
      }
      if (selectedModal.type === "edit-addition") {
        if (!current.pools.some((pool) =>
          pool.id === poolId && pool.additions.some((addition) => addition.id === selectedModal.additionId),
        )) return current;
        return {
          ...current,
          pools: current.pools.map((pool) => pool.id !== poolId ? pool : {
            ...pool,
            additions: pool.additions.map((addition) =>
              addition.id === selectedModal.additionId
                ? { ...addition, amount: form.amount, date: form.date }
                : addition,
            ),
          }),
        };
      }
      if (!current.pools.some((pool) =>
        pool.id === poolId && pool.recurring.some((rule) => rule.id === selectedModal.ruleId),
      )) return current;
      return {
        ...current,
        pools: current.pools.map((pool) => pool.id !== poolId ? pool : {
          ...pool,
          recurring: pool.recurring.map((rule) =>
              rule.id === selectedModal.ruleId
                ? {
                    ...rule,
                    amount: form.amount,
                    cadence: form.cadence,
                    start_date: form.date,
                    end_date: form.endDate,
                    month: form.cadence === "YearlyNthWeekday" ? form.month : undefined,
                    nth_weekday: form.cadence === "YearlyNthWeekday" ? form.nthWeekday : undefined,
                    weekday: form.cadence === "YearlyNthWeekday" ? form.weekday : undefined,
                  }
                : rule,
          ),
        }),
      };
    });
    setModal(null);
    return null;
  }

  function saveEvent(name: string, days: LeaveDay[]): string | null {
    if (selectedModal?.type === "edit-event") {
      if (!store.events.some((event) => event.id === selectedModal.eventId)) return "This event no longer exists.";
      setStore((current) => ({
        ...current,
        events: current.events.map((event) =>
          event.id === selectedModal.eventId ? { ...event, name, days } : event,
        ),
      }));
    } else {
      setStore((current) => {
        const ids = allocateIds(current);
        const event: LeaveEvent = { id: ids.firstId, name, days };
        return { ...current, next_id: ids.nextId, events: [...current.events, event] };
      });
    }
    setModal(null);
    return null;
  }

  function openEditEvent(event: LeaveEvent) {
    setModal({
      type: "edit-event",
      eventId: event.id,
      name: event.name,
      days: eventInputDays(event.days),
    });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="hima home">
          <span className="brand-mark">h</span>
          <span className="brand-name">hima</span>
        </a>
        <div className="topbar-right">
          <span className="privacy-note">
            <span className="privacy-dot" />
            Saved on this device
          </span>
          <button className="button button-primary" type="button" onClick={createPool}>
            <span className="button-plus">+</span>
            New pool
          </button>
        </div>
      </header>

      <main id="top" className="page-content">
        <section className="page-intro">
          <div className="eyebrow">A LITTLE MORE ROOM TO BREATHE</div>
          <h1>Your time, in good hands.</h1>
          <p>Plan personal leave with a clear picture of what you&apos;ve saved and what&apos;s ahead.</p>
        </section>

        <section className="balance-card">
          <div className="balance-topline">
            <div className="balance-main">
              <div className="balance-kicker">PROJECTED PPL BALANCE</div>
              <div className={balance.balance < 0 ? "balance-number is-negative" : "balance-number"}>
                {formatHours(balance.balance)}
                <span className="balance-unit">hours</span>
              </div>
            </div>
            <CalendarPicker value={balanceDate} onChange={setBalanceDate} />
          </div>
          <div className="balance-divider" />
          <div className="balance-breakdown">
            <div className="breakdown-item">
              <span className="breakdown-icon icon-in">↗</span>
              <span className="breakdown-label">Accrued by this date</span>
              <strong>{formatHours(balance.accrued)} h</strong>
            </div>
            <div className="breakdown-item">
              <span className="breakdown-icon icon-out">↘</span>
              <span className="breakdown-label">Planned leave by this date</span>
              <strong>{formatHours(balance.used)} h</strong>
            </div>
            <div className="balance-hint">All amounts are in hours</div>
          </div>
        </section>

        <BalanceChart history={history} today={chartHistoryEnd} selectedDate={balanceDate} />

        <div className="section-heading-row">
          <div>
            <div className="section-overline">THE BIG PICTURE</div>
            <h2>Your pools</h2>
          </div>
          <span className="as-of-label">Balances as of {prettyDate(balanceDate)}</span>
        </div>

        <div className="workspace-grid">
          <section className="pools-column" aria-label="Leave pools">
            {store.pools.length === 0 ? (
              <div className="empty-card pool-empty">
                <div className="empty-illustration">✳</div>
                <h3>Start with a pool</h3>
                <p>Give your leave a home. Add a one-off balance now, or set up regular accruals as you go.</p>
                <button className="button button-primary" type="button" onClick={createPool}>
                  <span className="button-plus">+</span>
                  Create your first pool
                </button>
              </div>
            ) : store.pools.map((pool) => (
              <PoolCard
                key={pool.id}
                pool={pool}
                balanceDate={balanceDate}
                store={store}
                onEdit={() => setModal({ type: "edit-pool", poolId: pool.id })}
                onDelete={() => removePool(pool.id, pool.name)}
                onAddTime={() => setModal({ type: "add-time", poolId: pool.id })}
                onEditAddition={(additionId) => setModal({ type: "edit-addition", poolId: pool.id, additionId })}
                onEditRecurring={(ruleId) => setModal({ type: "edit-recurring", poolId: pool.id, ruleId })}
                onDeleteAddition={(additionId) => removeAddition(pool.id, additionId, false)}
                onDeleteRecurring={(ruleId) => removeAddition(pool.id, ruleId, true)}
              />
            ))}
          </section>

          <section className="events-column" aria-label="Planned leave events">
            <div className="events-panel">
              <div className="events-panel-header">
                <div>
                  <div className="section-overline">MAKE SPACE FOR LIFE</div>
                  <h2>Planned leave</h2>
                </div>
                <button
                  className="button button-outline button-small"
                  type="button"
                  disabled={store.pools.length === 0}
                  onClick={createEvent}
                >
                  <span className="button-plus">+</span>
                  Add event
                </button>
              </div>
              <p className="events-caption">Each event day draws from its selected pool.</p>

              {timeline.length === 0 ? (
                <div className="events-empty">
                  <span className="events-empty-mark">↗</span>
                  <p>Your plans will show up here.</p>
                  {store.pools.length === 0 ? (
                    <span className="events-empty-subtitle">Create a pool first to log leave.</span>
                  ) : (
                    <button className="text-button" type="button" onClick={createEvent}>
                      Add your first event →
                    </button>
                  )}
                </div>
              ) : (
                <div className="timeline-list">
                  {timeline.map((event) => {
                    const includedDays = event.days.filter((day) => day.date <= balanceDate).length;
                    const statusClass = includedDays === event.days.length
                      ? "event-status event-status-counted"
                      : includedDays > 0
                        ? "event-status event-status-partial"
                        : "event-status";
                    const status = includedDays === event.days.length
                      ? "Included in balance"
                      : includedDays > 0
                        ? "Partly included"
                        : "After selected date";
                    const firstDate = event.days.map((day) => day.date).sort()[0] ?? "";
                    return (
                      <article className="event-row" key={event.id}>
                        <div className="event-date-block">
                          <span className="event-month">{monthLabel(firstDate)}</span>
                          <strong>{dayLabel(firstDate)}</strong>
                        </div>
                        <div className="event-info">
                          <strong>{event.name}</strong>
                          <span>
                            {eventPoolSummary(event, store.pools)} · {event.days.length} {event.days.length === 1 ? "day" : "days"} · {eventDateRangeLabel(event)}
                          </span>
                          <span className="event-day-details">{eventDaySummary(event, store.pools)}</span>
                          <span className={statusClass}>{status}</span>
                        </div>
                        <div className="event-amount">−{formatHours(eventTotalHours(event))} h</div>
                        <div className="event-actions">
                          <button
                            className="icon-button"
                            type="button"
                            title="Edit event"
                            aria-label={`Edit ${event.name}`}
                            onClick={() => openEditEvent(event)}
                          >
                            ✎
                          </button>
                          <button
                            className="icon-button event-delete"
                            type="button"
                            title="Delete event"
                            aria-label={`Delete ${event.name}`}
                            onClick={() => setStore((current) => ({
                              ...current,
                              events: current.events.filter((item) => item.id !== event.id),
                            }))}
                          >
                            ×
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              <div className="events-panel-footer">
                <span>{timeline.length} {timeline.length === 1 ? "event" : "events"}</span>
                <span>{formatHours(balance.used)} h used by selected date</span>
              </div>
            </div>
          </section>
        </div>

        <footer className="page-footer">
          <span className="footer-brand">hima</span>
          <span>A little more clarity for your time off.</span>
          <span className="footer-hours">All balances shown in hours</span>
        </footer>
      </main>

      {selectedModal?.type === "new-pool" && (
        <PoolModal
          key="new-pool"
          editing={false}
          onClose={() => setModal(null)}
          onSave={savePool}
        />
      )}
      {selectedModal?.type === "edit-pool" && (
        <PoolModal
          key={`edit-pool-${selectedModal.poolId}`}
          editing
          initialName={store.pools.find((pool) => pool.id === selectedModal.poolId)?.name ?? ""}
          initialCaps={store.pools.find((pool) => pool.id === selectedModal.poolId)?.caps ?? []}
          onClose={() => setModal(null)}
          onSave={savePool}
        />
      )}
      {(selectedModal?.type === "add-time" ||
        selectedModal?.type === "edit-addition" ||
        selectedModal?.type === "edit-recurring") && (
        <AdditionModalForState
          key={`${selectedModal.type}-${selectedModal.poolId}-${"additionId" in selectedModal ? selectedModal.additionId : "ruleId" in selectedModal ? selectedModal.ruleId : "new"}`}
          modal={selectedModal}
          pools={store.pools}
          onClose={() => setModal(null)}
          onSave={saveAddition}
        />
      )}
      {(selectedModal?.type === "new-event" || selectedModal?.type === "edit-event") && (
        <EventModal
          key={selectedModal.type === "new-event" ? "new-event" : `edit-event-${selectedModal.eventId}`}
          pools={store.pools}
          editing={selectedModal.type === "edit-event"}
          initialName={selectedModal.type === "edit-event" ? selectedModal.name : ""}
          initialDays={selectedModal.type === "new-event" ? selectedModal.initialDays : selectedModal.days}
          onClose={() => setModal(null)}
          onSave={saveEvent}
        />
      )}
    </div>
  );
}

interface PoolCardProps {
  pool: Pool;
  balanceDate: string;
  store: Store;
  onEdit: () => void;
  onDelete: () => void;
  onAddTime: () => void;
  onEditAddition: (id: number) => void;
  onEditRecurring: (id: number) => void;
  onDeleteAddition: (id: number) => void;
  onDeleteRecurring: (id: number) => void;
}

function PoolCard({
  pool,
  balanceDate,
  store,
  onEdit,
  onDelete,
  onAddTime,
  onEditAddition,
  onEditRecurring,
  onDeleteAddition,
  onDeleteRecurring,
}: PoolCardProps) {
  const currentBalance = poolBalanceOn(store, pool.id, balanceDate);
  const lifetimeTotals = poolTotalsOn(store, pool.id, todayDate());
  return (
    <article className="pool-card">
      <div className="pool-card-header">
        <div className="pool-title-group">
          <div className="pool-icon">◌</div>
          <div>
            <h3>{pool.name}</h3>
            <div className="pool-subtitle">Personal leave pool</div>
          </div>
        </div>
        <div className="pool-actions">
          <button className="icon-button" type="button" title="Edit pool" aria-label={`Edit ${pool.name}`} onClick={onEdit}>✎</button>
          <button className="icon-button delete-button" type="button" title="Delete pool" aria-label={`Delete ${pool.name}`} onClick={onDelete}>×</button>
        </div>
      </div>
      <div className={currentBalance < 0 ? "pool-balance pool-balance-negative" : "pool-balance"}>
        {formatHours(currentBalance)}<span>h</span>
      </div>
      <div className="pool-balance-caption">available on {prettyDate(balanceDate)}</div>
      <div className="pool-lifetime-metrics" aria-label={`Lifetime totals for ${pool.name} through today`}>
        <div className="pool-lifetime-metric">
          <span>Lifetime accrued</span>
          <strong>{formatHours(lifetimeTotals.accrued)}<small> h</small></strong>
        </div>
        <div className="pool-lifetime-metric">
          <span>Lifetime used</span>
          <strong>{formatHours(lifetimeTotals.used)}<small> h</small></strong>
        </div>
      </div>
      <div className="pool-rules">
        {pool.additions.length === 0 && pool.recurring.length === 0 && pool.caps.length === 0 ? (
          <p className="no-rules">No time added yet. Add a balance or set a schedule.</p>
        ) : (
          <>
            {pool.caps.map((cap) => (
              <div className="rule-row" key={`cap-${cap.id}`}>
                <span className="rule-symbol cap-symbol">≤</span>
                <span className="rule-copy">Maximum balance {formatHours(cap.max_balance)} h</span>
                <span className="rule-date">{prettyDate(cap.start_date)} – {prettyDate(cap.end_date)}</span>
              </div>
            ))}
            {pool.recurring.map((rule) => (
              <div className="rule-row" key={`recurring-${rule.id}`}>
                <span className="rule-symbol recurring-symbol">↻</span>
                <span className="rule-copy">+{formatHours(rule.amount)} h {recurringScheduleDescription(rule)}</span>
                <span className="rule-date">
                  {rule.cadence === "YearlyNthWeekday" ? "starting " : "from "}{prettyDate(rule.start_date)}
                  {rule.end_date ? ` · until ${prettyDate(rule.end_date)}` : ""}
                </span>
                <div className="rule-actions">
                  <button className="icon-button" type="button" title="Edit recurring addition" aria-label="Edit recurring addition" onClick={() => onEditRecurring(rule.id)}>✎</button>
                  <button className="icon-button rule-delete" type="button" title="Delete recurring addition" aria-label="Delete recurring addition" onClick={() => onDeleteRecurring(rule.id)}>×</button>
                </div>
              </div>
            ))}
            {[...pool.additions].reverse().map((addition) => (
              <div className="rule-row" key={`addition-${addition.id}`}>
                <span className="rule-symbol one-time-symbol">+</span>
                <span className="rule-copy">+{formatHours(addition.amount)} h one-time</span>
                <span className="rule-date">on {prettyDate(addition.date)}</span>
                <div className="rule-actions">
                  <button className="icon-button" type="button" title="Edit one-time addition" aria-label="Edit one-time addition" onClick={() => onEditAddition(addition.id)}>✎</button>
                  <button className="icon-button rule-delete" type="button" title="Delete one-time addition" aria-label="Delete one-time addition" onClick={() => onDeleteAddition(addition.id)}>×</button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
      <div className="pool-card-footer">
        <span className="pool-unit-note">Tracked in hours</span>
        <button className="button button-soft button-small" type="button" onClick={onAddTime}>
          <span className="button-plus">+</span>
          Add time
        </button>
      </div>
    </article>
  );
}

interface AdditionModalForStateProps {
  modal: Extract<ModalState, { type: "add-time" | "edit-addition" | "edit-recurring" }>;
  pools: Pool[];
  onClose: () => void;
  onSave: (addition: AdditionFormData) => string | null;
}

function AdditionModalForState({ modal, pools, onClose, onSave }: AdditionModalForStateProps) {
  const pool = pools.find((candidate) => candidate.id === modal.poolId);
  if (!pool) return null;

  if (modal.type === "edit-addition") {
    const addition = pool.additions.find((candidate) => candidate.id === modal.additionId);
    if (!addition) return null;
    return (
      <AdditionModal
        poolName={pool.name}
        mode="edit-one-time"
        initialAmount={formatHours(addition.amount)}
        initialDate={addition.date}
        onClose={onClose}
        onSave={onSave}
      />
    );
  }
  if (modal.type === "edit-recurring") {
    const rule = pool.recurring.find((candidate) => candidate.id === modal.ruleId);
    if (!rule) return null;
    return (
      <AdditionModal
        poolName={pool.name}
        mode="edit-recurring"
        initialAmount={formatHours(rule.amount)}
        initialDate={rule.start_date}
        initialEndDate={rule.end_date}
        initialCadence={rule.cadence}
        initialMonth={rule.month}
        initialNthWeekday={rule.nth_weekday}
        initialWeekday={rule.weekday}
        onClose={onClose}
        onSave={onSave}
      />
    );
  }
  return (
    <AdditionModal poolName={pool.name} mode="add" onClose={onClose} onSave={onSave} />
  );
}

export default App;
