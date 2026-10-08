import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { closestCenter, defaultDropAnimationSideEffects, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { defaultAnimateLayoutChanges, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BalanceChart } from "./BalanceChart";
import { CalendarPicker } from "./CalendarPicker";
import { poolColor } from "./poolColors";
import { FirstDayOfWeekContext, IgnoreWeekendsContext, loadDefaultTimeline, loadFirstDayOfWeek, loadIgnoreWeekends, nextWeekday, saveSettings } from "./settings";
import {
  AdditionModal,
  ModalFrame,
  EventModal,
  PoolModal,
  PoolUsageModal,
  SettingsModal,
  eventInputDays,
  type AdditionFormData,
  type PoolCapFormData,
} from "./Modals";
import {
  addDays,
  allocateIds,
  balanceHistory,
  capRangesOverlap,
  dayLabel,
  eventDateRangeLabel,
  eventTotalHours,
  formatHours,
  freshEventDays,
  loadStore,
  monthLabel,
  parseHours,
  parseStoreJson,
  poolBalanceOn,
  poolTotalsOn,
  prettyDate,
  recurringScheduleDescription,
  saveStore,
  serializeStoreJson,
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
  | { type: "settings" }
  | { type: "new-pool" }
  | { type: "edit-pool"; poolId: number }
  | { type: "edit-cap"; poolId: number; capId: number }
  | { type: "pool-usage"; poolId: number }
  | { type: "pool-info"; poolId: number }
  | { type: "add-time"; poolId: number }
  | { type: "edit-addition"; poolId: number; additionId: number }
  | { type: "edit-recurring"; poolId: number; ruleId: number }
  | { type: "new-event"; initialDays: EventDayInput[] }
  | { type: "edit-event"; eventId: number; name: string; days: EventDayInput[] };

function App() {
  const [firstDayOfWeek, setFirstDayOfWeek] = useState(loadFirstDayOfWeek);
  const [ignoreWeekends, setIgnoreWeekends] = useState(loadIgnoreWeekends);
  const [defaultTimeline, setDefaultTimeline] = useState(loadDefaultTimeline);
  const [store, setStore] = useState<Store>(loadStore);
  const [draggedPoolId, setDraggedPoolId] = useState<number | null>(null);
  const draggedPool = store.pools.find((pool) => pool.id === draggedPoolId);
  const poolDragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [balanceDate, setBalanceDate] = useState(todayDate);
  const [eventSelection, setEventSelection] = useState<{ id: number; request: number; zoom: boolean; wide: boolean } | null>(null);
  const [highlightedEventId, setHighlightedEventId] = useState<number | null>(null);
  const selectedEvent = store.events.find((event) => event.id === highlightedEventId);
  const visiblePools = selectedEvent
    ? store.pools.filter((pool) => selectedEvent.days.some((day) => day.allocations
      .some((allocation) => allocation.pool_id === pool.id && allocation.hours > 0)))
    : store.pools;
  const zoomEvent = store.events.find((event) => event.id === eventSelection?.id);
  const eventClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedUsesPoolId, setSelectedUsesPoolId] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const closeSettings = useCallback(() => {
    setModal(null);
    settingsButtonRef.current?.focus();
  }, []);
  const importInputRef = useRef<HTMLInputElement>(null);
  const timelineListRef = useRef<HTMLDivElement>(null);
  const chartHistoryEnd = todayDate();
  const balance = totalsOn(store, balanceDate);
  const history = useMemo(
    () => balanceHistory({ ...store, pools: store.pools.map((pool) => ({ ...pool, hidden_from_graph: false })) }, chartHistoryEnd),
    [store, chartHistoryEnd],
  );
  const poolHistories = useMemo(
    () => Object.fromEntries(store.pools.map((pool) => [pool.id, balanceHistory(store, chartHistoryEnd, pool.id)])),
    [store, chartHistoryEnd],
  );
  const firstPoolId = store.pools[0]?.id;
  const timeline = [...store.events].sort((left, right) =>
    left.days[0]?.date.localeCompare(right.days[0]?.date ?? "") ?? 0,
  );
  const usesFilterPool = store.pools.find((pool) => pool.id === selectedUsesPoolId);
  const visibleTimeline = usesFilterPool
    ? timeline.flatMap((event) => {
        const days = event.days.flatMap((day) => {
          const allocations = day.allocations.filter((allocation) => allocation.pool_id === usesFilterPool.id);
          return allocations.length > 0 ? [{ ...day, allocations }] : [];
        });
        return days.length > 0 ? [{ ...event, days }] : [];
      })
    : timeline;
  const visibleUsedHours = usesFilterPool
    ? poolTotalsOn(store, usesFilterPool.id, balanceDate).used
    : balance.used;
  const selectedModal = modal;
  const usagePool = selectedModal?.type === "pool-usage"
    ? store.pools.find((pool) => pool.id === selectedModal.poolId)
    : undefined;
  const informationPool = selectedModal?.type === "pool-info"
    ? store.pools.find((pool) => pool.id === selectedModal.poolId)
    : undefined;

  useEffect(() => {
    saveStore(store);
  }, [store]);

  useEffect(() => {
    saveSettings(firstDayOfWeek, ignoreWeekends, defaultTimeline);
  }, [firstDayOfWeek, ignoreWeekends, defaultTimeline]);

  useEffect(() => () => {
    if (eventClickTimer.current !== null) clearTimeout(eventClickTimer.current);
  }, []);

  useEffect(() => {
    scrollToClosestEvent(balanceDate);
  }, [balanceDate, selectedUsesPoolId, store.events]);

  function scrollToClosestEvent(date: string) {
    const list = timelineListRef.current;
    if (!list) return;
    const clickedTime = Date.parse(date);
    let closestEventId: number | undefined;
    let closestDistance = Infinity;
    for (const event of visibleTimeline) {
      for (const day of event.days) {
        const distance = Math.abs(Date.parse(day.date) - clickedTime);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestEventId = event.id;
        }
      }
    }
    const row = list.querySelector<HTMLElement>(`[data-event-id="${closestEventId}"]`);
    if (!row) return;
    list.scrollTo({
      top: list.scrollTop + row.getBoundingClientRect().top - list.getBoundingClientRect().top - list.clientTop,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }

  function createPool() {
    setModal({ type: "new-pool" });
  }

  function reorderPool(poolId: number, targetId: number) {
    setStore((current) => {
      const from = current.pools.findIndex((pool) => pool.id === poolId);
      const to = current.pools.findIndex((pool) => pool.id === targetId);
      if (from < 0 || to < 0 || from === to) return current;
      const pools = [...current.pools];
      const [pool] = pools.splice(from, 1);
      pools.splice(to, 0, pool);
      return { ...current, pools };
    });
  }

  function poolCardProps(pool: Pool): PoolCardProps {
    return {
      pool, balanceDate, store,
      selectedEvent,
      isSelected: usesFilterPool?.id === pool.id,
      onSelect: () => setSelectedUsesPoolId((current) => current === pool.id ? null : pool.id),
      onViewUsage: () => setModal({ type: "pool-usage", poolId: pool.id }),
      onViewInformation: () => setModal({ type: "pool-info", poolId: pool.id }),
      onEdit: () => setModal({ type: "edit-pool", poolId: pool.id }),
      onAddTime: () => setModal({ type: "add-time", poolId: pool.id }),
      onEditAddition: (additionId) => setModal({ type: "edit-addition", poolId: pool.id, additionId }),
      onEditRecurring: (ruleId) => setModal({ type: "edit-recurring", poolId: pool.id, ruleId }),
    };
  }

  function createEvent() {
    if (firstPoolId !== undefined) {
      setModal({ type: "new-event", initialDays: freshEventDays(firstPoolId) });
    }
  }

  function selectEvent(id: number) {
    const startDate = store.events.find((event) => event.id === id)?.days
      .map((day) => day.date).sort()[0];
    if (startDate) setBalanceDate(startDate);
    if (eventClickTimer.current !== null) clearTimeout(eventClickTimer.current);
    eventClickTimer.current = setTimeout(() => {
      setHighlightedEventId((current) => current === id ? null : id);
      eventClickTimer.current = null;
    }, 300);
  }

  function zoomToEvent(id: number) {
    if (eventClickTimer.current !== null) clearTimeout(eventClickTimer.current);
    eventClickTimer.current = null;
    setEventSelection((current) => ({
      id,
      request: (current?.request ?? 0) + 1,
      zoom: current?.id === id ? !current.zoom : true,
      wide: current?.id === id && current.zoom,
    }));
  }

  function exportData() {
    const blob = new Blob([serializeStoreJson(store)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hima-backup-${todayDate()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function importData(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    try {
      const imported = parseStoreJson(await file.text());
      const confirmed = window.confirm(
        `Replace the data saved in this browser with ${imported.pools.length} ${imported.pools.length === 1 ? "pool" : "pools"} and ${imported.events.length} ${imported.events.length === 1 ? "event" : "events"}?`,
      );
      if (!confirmed) return;
      setStore(imported);
      setBalanceDate(todayDate());
      setModal(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The file could not be read.";
      window.alert(`Could not import data: ${message}`);
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
    setModal(null);
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
    setModal({ type: "pool-info", poolId });
  }

  function savePool(
    name: string,
    openingAmount: string,
    openingDate: string,
    hiddenFromGraph: boolean,
    hiddenFromTotal: boolean,
    color?: string,
    newAdditionsExpireSameDay = false,
  ): string | null {
    if (selectedModal?.type === "edit-pool") {
      if (!store.pools.some((pool) => pool.id === selectedModal.poolId)) return "This pool no longer exists.";
      setStore((current) => {
        return {
          ...current,
          pools: current.pools.map((pool) =>
            pool.id === selectedModal.poolId ? { ...pool, name, color, hidden_from_graph: hiddenFromGraph, hidden_from_total: hiddenFromTotal, new_additions_expire_same_day: newAdditionsExpireSameDay || undefined } : pool,
          ),
        };
      });
    } else {
      const initialAmount = openingAmount.trim() === "" ? 0 : parseHours(openingAmount, true);
      if (initialAmount === null) return "Enter a starting balance with up to two decimal places.";
      setStore((current) => {
        const openingAdditionCount = initialAmount > 0 ? 1 : 0;
        const currentIds = allocateIds(current, 1 + openingAdditionCount);
        const additions: OneTimeAddition[] = initialAmount > 0
          ? [{ id: currentIds.firstId + 1, amount: initialAmount, date: openingDate, expires_same_day: newAdditionsExpireSameDay || undefined }]
          : [];
        return {
          ...current,
          next_id: currentIds.nextId,
          pools: [...current.pools, { id: currentIds.firstId, name, additions, recurring: [], caps: [], hidden_from_graph: hiddenFromGraph, hidden_from_total: hiddenFromTotal, new_additions_expire_same_day: newAdditionsExpireSameDay || undefined }],
        };
      });
    }
    setModal(null);
    return null;
  }

  function saveCap(cap: PoolCapFormData): string | null {
    if (selectedModal?.type !== "add-time" && selectedModal?.type !== "edit-cap") return "This pool is no longer available.";
    const pool = store.pools.find((pool) => pool.id === selectedModal.poolId);
    if (!pool) return "This pool no longer exists.";
    const capId = selectedModal.type === "edit-cap" ? selectedModal.capId : undefined;
    if (capId !== undefined && !pool.caps.some((existing) => existing.id === capId)) return "This cap no longer exists.";
    if (capRangesOverlap([...pool.caps.filter((existing) => existing.id !== capId), cap])) return "Cap date ranges must not overlap.";
    setStore((current) => {
      const ids = capId === undefined ? allocateIds(current) : { firstId: capId, nextId: current.next_id };
      return {
        ...current,
        next_id: ids.nextId,
        pools: current.pools.map((candidate) => candidate.id === pool.id
          ? { ...candidate, caps: capId === undefined
            ? [...candidate.caps, { ...cap, id: ids.firstId }]
            : candidate.caps.map((existing) => existing.id === capId ? { ...cap, id: capId } : existing) }
          : candidate),
      };
    });
    setModal(capId === undefined ? null : { type: "pool-info", poolId: pool.id });
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
        const entries = [{ amount: form.amount, date: form.date }, ...(!form.recurring && !form.reset ? form.additionalEntries ?? [] : [])];
        const ids = allocateIds(current, entries.length);
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
                      reset: form.reset || undefined,
                      expires_same_day: !form.reset && pool.new_additions_expire_same_day || undefined,
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
                  additions: [...pool.additions, ...entries.map((entry, index) => ({ id: ids.firstId + index, amount: entry.amount, date: entry.date, reset: form.reset || undefined, expires_same_day: !form.reset && pool.new_additions_expire_same_day || undefined }))],
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
                ? { ...addition, amount: form.amount, date: form.date, reset: form.reset || undefined, expires_same_day: !form.reset && form.expiresSameDay || undefined }
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
                    reset: form.reset || undefined,
                    expires_same_day: !form.reset && form.expiresSameDay || undefined,
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
    <FirstDayOfWeekContext.Provider value={firstDayOfWeek}>
    <IgnoreWeekendsContext.Provider value={ignoreWeekends}>
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
          <button ref={settingsButtonRef} className="icon-button" type="button" title="Settings" aria-label="Open settings" aria-haspopup="dialog" onClick={() => setModal({ type: "settings" })}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 3-.5 2-2 1.2-2-.6-2 3.5L4 10.5v3l-1.5 1.4 2 3.5 2-.6 2 1.2.5 2h6l.5-2 2-1.2 2 .6 2-3.5-1.5-1.4v-3l1.5-1.4-2-3.5-2 .6-2-1.2L15 3Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            aria-label="Choose a JSON backup to import"
            onChange={importData}
          />
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
            <CalendarPicker value={balanceDate} onChange={setBalanceDate} display="large-date" />
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

        <BalanceChart
          defaultTimeline={defaultTimeline}
          history={history}
          today={chartHistoryEnd}
          selectedDate={balanceDate}
          onDateChange={setBalanceDate}
          onToday={() => {
            if (eventClickTimer.current !== null) clearTimeout(eventClickTimer.current);
            eventClickTimer.current = null;
            setHighlightedEventId(null);
            setEventSelection(null);
            setBalanceDate(ignoreWeekends ? nextWeekday(chartHistoryEnd) : chartHistoryEnd);
          }}
          pools={store.pools}
          poolHistories={poolHistories}
          selectedEvent={selectedEvent}
          zoomEvent={zoomEvent}
          eventSelectionRequest={eventSelection?.request}
          zoomToSelectedEvent={eventSelection?.zoom}
          widenSelectedEvent={eventSelection?.wide}
        />

        <div className="section-heading-row">
          <div>
            <div className="section-overline">THE BIG PICTURE</div>
            <div className="pools-heading">
              <h2>Your pools</h2>
              <button className="button button-primary button-small" type="button" onClick={createPool}>
                <span className="button-plus">+</span>
                Add pool
              </button>
              <button
                className="button button-outline button-small"
                type="button"
                disabled={store.pools.length === 0}
                onClick={createEvent}
              >
                <span className="button-plus">+</span>
                Add event
              </button>
              <button
                className="text-button"
                type="button"
                disabled={highlightedEventId === null && selectedUsesPoolId === null}
                onClick={() => {
                  if (eventClickTimer.current !== null) clearTimeout(eventClickTimer.current);
                  eventClickTimer.current = null;
                  setHighlightedEventId(null);
                  setSelectedUsesPoolId(null);
                }}
              >
                Clear Selection
              </button>
            </div>
          </div>
          <span className="as-of-label">Balances as of {prettyDate(balanceDate)}</span>
        </div>

        <div className="workspace-grid">
          <section className="pools-column" aria-label="Leave pools">
            <DndContext
              sensors={poolDragSensors}
              collisionDetection={closestCenter}
              onDragStart={({ active }) => setDraggedPoolId(Number(active.id))}
              onDragCancel={() => setDraggedPoolId(null)}
              onDragEnd={({ active, over }) => {
                if (over && active.id !== over.id) reorderPool(Number(active.id), Number(over.id));
                setDraggedPoolId(null);
              }}
            >
            <SortableContext items={visiblePools.map((pool) => pool.id)} strategy={verticalListSortingStrategy}>
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
            ) : visiblePools.map((pool) => (
              <PoolCard
                key={pool.id}
                {...poolCardProps(pool)}
              />
            ))}
            </SortableContext>
            <DragOverlay adjustScale={false} dropAnimation={{
              duration: 220,
              easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
              sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0" } } }),
            }}>
              {draggedPool ? <PoolCardContent {...poolCardProps(draggedPool)} overlay /> : null}
            </DragOverlay>
            </DndContext>
          </section>

          <section className="events-column" aria-label="Planned leave events">
            <div className="events-panel">
              <div className="events-panel-header">
                <div>
                  <div className="section-overline">MAKE SPACE FOR LIFE</div>
                  <h2>Planned leave</h2>
                </div>
              </div>
              <p className="events-caption">
                {usesFilterPool ? `Showing leave using ${usesFilterPool.name}.` : "Each event day draws from its selected pool."}
                {usesFilterPool && (
                  <button className="text-button" type="button" onClick={() => setSelectedUsesPoolId(null)}>
                    Show all
                  </button>
                )}
              </p>

              {visibleTimeline.length === 0 ? (
                <div className="events-empty">
                  <span className="events-empty-mark">↗</span>
                  <p>{usesFilterPool ? `No planned leave uses ${usesFilterPool.name} yet.` : "Your plans will show up here."}</p>
                  {usesFilterPool ? null : store.pools.length === 0 ? (
                    <span className="events-empty-subtitle">Create a pool first to log leave.</span>
                  ) : (
                    <button className="text-button" type="button" onClick={createEvent}>
                      Add your first event →
                    </button>
                  )}
                </div>
              ) : (
                <div className="timeline-list" ref={timelineListRef}>
                  {visibleTimeline.map((event) => {
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
                    const fullEvent = store.events.find((candidate) => candidate.id === event.id) ?? event;
                    const totalHours = eventTotalHours(fullEvent);
                    const poolShares = store.pools.map((pool) => ({
                      pool,
                      hours: fullEvent.days.reduce((total, day) => total + day.allocations
                        .filter((allocation) => allocation.pool_id === pool.id)
                        .reduce((sum, allocation) => sum + allocation.hours, 0), 0),
                    })).filter((share) => share.hours > 0);
                    return (
                      <article className={`event-row${selectedEvent?.id === event.id ? " event-row-selected" : ""}`} key={event.id}
                        data-event-id={event.id}
                        onClick={(click) => {
                          if (click.target instanceof Element && click.target.closest("button")) return;
                          selectEvent(event.id);
                        }}
                        onDoubleClick={(click) => {
                          if (click.target instanceof Element && click.target.closest("button")) return;
                          zoomToEvent(event.id);
                        }}>
                        <div className="event-date-block">
                          <span className="event-month">{monthLabel(firstDate)}</span>
                          <strong>{dayLabel(firstDate)}</strong>
                        </div>
                        <div className="event-info">
                          <strong><button className="pool-select-button" type="button"
                            aria-label={`Highlight ${event.name} in graph`}
                            aria-pressed={selectedEvent?.id === event.id}
                            title="Click to toggle highlight; double-click to switch zoom modes"
                            onClick={() => selectEvent(event.id)}
                            onDoubleClick={() => zoomToEvent(event.id)}
                          >{event.name}</button></strong>
                          <span>{eventDateRangeLabel(event)}</span>
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
                        </div>
                        {totalHours > 0 && (
                          <div className="event-pool-bar" role="img" aria-label={poolShares.map(({ pool, hours }) =>
                            `${pool.name}: ${formatHours(hours)} hours (${(hours / totalHours * 100).toFixed(1)}%)`,
                          ).join(", ")}>
                            {poolShares.map(({ pool, hours }) => (
                              <span
                                key={pool.id}
                                style={{ width: `${hours / totalHours * 100}%`, backgroundColor: poolColor(pool.id, pool.color) }}
                                title={`${pool.name}: ${formatHours(hours)} h (${(hours / totalHours * 100).toFixed(1)}%)`}
                              />
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}

              <div className="events-panel-footer">
                <span>{visibleTimeline.length} {visibleTimeline.length === 1 ? "event" : "events"}</span>
                <span>{formatHours(visibleUsedHours)} h used by selected date</span>
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

      {selectedModal?.type === "settings" && <SettingsModal firstDayOfWeek={firstDayOfWeek} onChange={setFirstDayOfWeek} ignoreWeekends={ignoreWeekends} onIgnoreWeekendsChange={setIgnoreWeekends} defaultTimeline={defaultTimeline} onDefaultTimelineChange={setDefaultTimeline} onExport={exportData} onImport={() => importInputRef.current?.click()} onClose={closeSettings} />}
      {informationPool && (
        <PoolInformationModal {...poolCardProps(informationPool)} onEditCap={(capId) => setModal({ type: "edit-cap", poolId: informationPool.id, capId })} onClose={() => setModal(null)} />
      )}
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
          initialColor={poolColor(selectedModal.poolId, store.pools.find((pool) => pool.id === selectedModal.poolId)?.color)}
          initialHiddenFromGraph={store.pools.find((pool) => pool.id === selectedModal.poolId)?.hidden_from_graph}
          initialHiddenFromTotal={store.pools.find((pool) => pool.id === selectedModal.poolId)?.hidden_from_total}
          initialNewAdditionsExpireSameDay={store.pools.find((pool) => pool.id === selectedModal.poolId)?.new_additions_expire_same_day}
          onDelete={() => removePool(selectedModal.poolId, store.pools.find((pool) => pool.id === selectedModal.poolId)?.name ?? "")}
          onClose={() => setModal(null)}
          onSave={savePool}
        />
      )}
      {usagePool && (
        <PoolUsageModal
          key={`pool-usage-${usagePool.id}`}
          pool={usagePool}
          events={store.events}
          onClose={() => setModal(null)}
        />
      )}
      {selectedModal?.type === "edit-cap" && (() => {
        const pool = store.pools.find((candidate) => candidate.id === selectedModal.poolId);
        const cap = pool?.caps.find((candidate) => candidate.id === selectedModal.capId);
        return pool && cap ? <AdditionModal
          key={`edit-cap-${cap.id}`}
          poolName={pool.name}
          mode="edit-cap"
          onDelete={() => {
            if (!window.confirm("Remove this balance cap?")) return;
            setStore((current) => ({ ...current, pools: current.pools.map((candidate) => candidate.id === pool.id
              ? { ...candidate, caps: candidate.caps.filter((item) => item.id !== cap.id) } : candidate) }));
            setModal({ type: "pool-info", poolId: pool.id });
          }}
          initialAmount={String(cap.max_balance)}
          initialDate={cap.start_date}
          initialEndDate={cap.end_date}
          onClose={() => setModal({ type: "pool-info", poolId: pool.id })}
          onSave={saveAddition}
          onSaveCap={saveCap}
        /> : null;
      })()}
      {(selectedModal?.type === "add-time" ||
        selectedModal?.type === "edit-addition" ||
        selectedModal?.type === "edit-recurring") && (
        <AdditionModalForState
          key={`${selectedModal.type}-${selectedModal.poolId}-${"additionId" in selectedModal ? selectedModal.additionId : "ruleId" in selectedModal ? selectedModal.ruleId : "new"}`}
          modal={selectedModal}
          onDelete={(id, recurring) => removeAddition(selectedModal.poolId, id, recurring)}
          pools={store.pools}
          onClose={() => setModal(selectedModal.type === "add-time"
            ? null
            : { type: "pool-info", poolId: selectedModal.poolId })}
          onSave={saveAddition}
          onSaveCap={saveCap}
        />
      )}
      {(selectedModal?.type === "new-event" || selectedModal?.type === "edit-event") && (
        <EventModal
          store={store}
          key={selectedModal.type === "new-event" ? "new-event" : `edit-event-${selectedModal.eventId}`}
          pools={store.pools}
          editing={selectedModal.type === "edit-event"}
          onDelete={selectedModal.type === "edit-event" ? () => {
            setStore((current) => ({ ...current, events: current.events.filter((event) => event.id !== selectedModal.eventId) }));
            setModal(null);
          } : undefined}
          initialName={selectedModal.type === "edit-event" ? selectedModal.name : ""}
          initialDays={selectedModal.type === "new-event" ? selectedModal.initialDays : selectedModal.days}
          onClose={() => setModal(null)}
          onSave={saveEvent}
        />
      )}
    </div>
    </IgnoreWeekendsContext.Provider>
    </FirstDayOfWeekContext.Provider>
  );
}

interface PoolCardProps {
  pool: Pool;
  selectedEvent?: LeaveEvent;
  balanceDate: string;
  store: Store;
  isSelected: boolean;
  onSelect: () => void;
  onViewUsage: () => void;
  onViewInformation: () => void;
  onEdit: () => void;
  onAddTime: () => void;
  onEditAddition: (id: number) => void;
  onEditRecurring: (id: number) => void;
}

function PoolCard(props: PoolCardProps) {
  const sortable = useSortable({
    id: props.pool.id,
    disabled: props.store.pools.length < 2,
    animateLayoutChanges: (args) => args.isSorting && defaultAnimateLayoutChanges(args),
    transition: { duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
  });
  return <PoolCardContent {...props} sortable={sortable} />;
}

function PoolCardContent({
  pool,
  balanceDate,
  store,
  isSelected,
  selectedEvent,
  onSelect,
  onViewUsage,
  onViewInformation,
  onEdit,
  onAddTime,
  sortable,
  overlay = false,
}: PoolCardProps & { sortable?: ReturnType<typeof useSortable>; overlay?: boolean }) {
  const currentBalance = poolBalanceOn(store, pool.id, balanceDate);
  const dayAdded = poolTotalsOn(store, pool.id, balanceDate).accrued
    - poolTotalsOn(store, pool.id, addDays(balanceDate, -1)).accrued;
  const dayHours = store.events.reduce((total, event) => total + event.days
    .filter((day) => day.date === balanceDate)
    .flatMap((day) => day.allocations)
    .filter((allocation) => allocation.pool_id === pool.id)
    .reduce((sum, allocation) => sum + allocation.hours, 0), 0);
  const startingBalance = dayHours > 0
    ? poolBalanceOn({ ...store, events: store.events.map((event) => ({
        ...event, days: event.days.filter((day) => day.date !== balanceDate),
      })) }, pool.id, balanceDate)
    : currentBalance;
  const balanceChanged = currentBalance !== startingBalance - dayAdded;
  const balanceIncreased = currentBalance > startingBalance - dayAdded;
  const eventHours = selectedEvent?.days.reduce((total, day) => total + day.allocations
    .filter((allocation) => allocation.pool_id === pool.id)
    .reduce((sum, allocation) => sum + allocation.hours, 0), 0) ?? 0;
  const eventTotal = selectedEvent ? eventTotalHours(selectedEvent) : 0;
  return (
    <article
      ref={sortable?.setNodeRef}
      style={{
        transform: CSS.Translate.toString(sortable?.transform ?? null),
        transition: sortable?.transition,
        opacity: sortable?.isDragging ? 0 : undefined,
        height: overlay ? "100%" : undefined,
      }}
      className={`pool-card${isSelected ? " pool-card-selected" : ""}${overlay ? " pool-card-dragging" : ""}`}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("button, summary")) return;
        onSelect();
      }}
    >
      <div className="pool-card-header">
        <div className="pool-title-group">
          {store.pools.length > 1 && <button
            ref={sortable?.setActivatorNodeRef}
            {...sortable?.attributes}
            {...sortable?.listeners}
            className="icon-button pool-drag-handle"
            type="button"
            aria-label={`Reorder ${pool.name}`}
            title="Drag to reorder, or press Space then use the arrow keys"
          ><span aria-hidden="true">⠿</span></button>}
          <div className="pool-icon" style={{ color: poolColor(pool.id, pool.color), backgroundColor: `${poolColor(pool.id, pool.color)}20` }}>◌</div>
          <div>
            <h3>
              <button
                className="pool-select-button"
                type="button"
                aria-label={`Show planned leave using ${pool.name}`}
                aria-pressed={isSelected}
                onClick={onSelect}
              >
                {pool.name}
              </button>
            </h3>
            <div className="pool-subtitle">Personal leave pool</div>
          </div>
        </div>
        <div className="pool-actions">
          <button className="icon-button" type="button" title="Add time / use-by" aria-label={`Add time or use-by date to ${pool.name}`} onClick={onAddTime}>+</button>
          <button className="icon-button" type="button" title="View pool usage" aria-label={`View usage ledger for ${pool.name}`} onClick={onViewUsage}>
            <svg className="ledger-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M7 4.5h11a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 18 19.5H7a2.5 2.5 0 0 1-2.5-2.5V7A2.5 2.5 0 0 1 7 4.5Z" />
              <path d="M7 4.5v15M10 8h6M10 11.5h6M10 15h4" />
            </svg>
          </button>
          <button className="icon-button" type="button" title="Edit pool" aria-label={`Edit ${pool.name}`} onClick={onEdit}>✎</button>
          <button className="icon-button" type="button" title="Pool information" aria-label={`View information for ${pool.name}`} onClick={onViewInformation}>ⓘ</button>
        </div>
      </div>
      <div className="pool-balance-row">
        <div className={startingBalance - dayAdded < 0 ? "pool-balance pool-balance-negative" : "pool-balance"}>
          {formatHours(startingBalance - dayAdded)}<span>h</span>
        </div>
        {(dayHours > 0 || dayAdded > 0) && <div className={`pool-balance-change${balanceIncreased ? " pool-balance-change-added" : ""}`}>→ {formatHours(currentBalance)}<span>h</span></div>}
      </div>
      <div className="pool-balance-caption">
        starting balance on {prettyDate(balanceDate)}
        {balanceChanged && dayAdded > 0 && <span className="pool-time-added"> · +{formatHours(dayAdded)} h added</span>}
        {balanceChanged && dayHours > 0 && <span className="pool-time-used"> · {formatHours(dayHours)} h used that day</span>}
      </div>
      {selectedEvent && eventHours > 0 && (
        <div className="pool-event-subtraction">
          <div className="pool-event-subtraction-heading">
            <span className="pool-event-subtraction-icon" aria-hidden="true">−</span>
            <span className="pool-event-subtraction-label">{selectedEvent.name}</span>
            <strong>−{formatHours(eventHours)}h Total</strong>
          </div>
          <div className="pool-event-subtraction-track" role="img"
            aria-label={`${selectedEvent.name} draws ${formatHours(eventHours)} hours from ${pool.name}, ${(eventHours / eventTotal * 100).toFixed(1)}% of the event total`}>
            <span style={{ width: `${eventHours / eventTotal * 100}%`, backgroundColor: poolColor(pool.id, pool.color) }} />
          </div>
          <span className="pool-event-subtraction-caption">{(eventHours / eventTotal * 100).toFixed(1)}% of event hours</span>
        </div>
      )}
    </article>
  );
}

function PoolInformationModal({
  pool,
  store,
  onEditAddition,
  onEditRecurring,
  onClose,
  onEditCap,
}: PoolCardProps & { onClose: () => void; onEditCap: (id: number) => void }) {
  const lifetimeTotals = poolTotalsOn(store, pool.id, todayDate());
  return (
    <ModalFrame
      icon="ⓘ"
      title={`${pool.name} information`}
      description="Lifetime totals through today, balance caps and time schedules."
      labelledBy="pool-information-title"
      onClose={onClose}
    >
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
      <section className="pool-rules-disclosure" aria-labelledby="pool-information-rules-title">
        <h3 id="pool-information-rules-title">Caps, accruals and use-by dates</h3>
        <div className="pool-rules">
        {pool.additions.length === 0 && pool.recurring.length === 0 && pool.caps.length === 0 ? (
          <p className="no-rules">No time added yet. Add a balance or set a schedule.</p>
        ) : (
          <>
            {[...pool.caps].sort((left, right) => right.start_date.localeCompare(left.start_date)).map((cap) => (
              <div className="rule-row" key={`cap-${cap.id}`}>
                <span className="rule-symbol cap-symbol">≤</span>
                <span className="rule-copy">Maximum balance {formatHours(cap.max_balance)} h</span>
                <span className="rule-date">{prettyDate(cap.start_date)} – {cap.end_date ? prettyDate(cap.end_date) : "ongoing"}</span>
                <div className="rule-actions">
                  <button className="icon-button" type="button" title="Edit balance cap" aria-label="Edit balance cap" onClick={() => onEditCap(cap.id)}>✎</button>
                </div>
              </div>
            ))}
            {[...pool.recurring].sort((left, right) => right.start_date.localeCompare(left.start_date)).map((rule) => (
              <div className="rule-row" key={`recurring-${rule.id}`}>
                <span className="rule-symbol recurring-symbol">↻</span>
                <span className="rule-copy">{rule.reset ? `Reset to ${formatHours(rule.amount)} h` : `+${formatHours(rule.amount)} h`} {recurringScheduleDescription(rule)}{rule.expires_same_day ? " · valid that day only" : ""}</span>
                <span className="rule-date">
                  {rule.cadence === "YearlyNthWeekday" ? "starting " : "from "}{prettyDate(rule.start_date)}
                  {rule.end_date ? ` · until ${prettyDate(rule.end_date)}` : ""}
                </span>
                <div className="rule-actions">
                  <button className="icon-button" type="button" title={rule.reset ? "Edit recurring balance reset" : "Edit recurring addition"} aria-label={rule.reset ? "Edit recurring balance reset" : "Edit recurring addition"} onClick={() => onEditRecurring(rule.id)}>✎</button>
                </div>
              </div>
            ))}
            {[...pool.additions].sort((left, right) => right.date.localeCompare(left.date)).map((addition) => (
              <div className="rule-row" key={`addition-${addition.id}`}>
                <span className="rule-symbol one-time-symbol">+</span>
                <span className="rule-copy">{addition.reset ? `Reset to ${formatHours(addition.amount)} h` : `+${formatHours(addition.amount)} h one-time`}{addition.expires_same_day ? " · valid that day only" : ""}</span>
                <span className="rule-date">on {prettyDate(addition.date)}</span>
                <div className="rule-actions">
                  <button className="icon-button" type="button" title={addition.reset ? "Edit balance reset" : "Edit one-time addition"} aria-label={addition.reset ? "Edit balance reset" : "Edit one-time addition"} onClick={() => onEditAddition(addition.id)}>✎</button>
                </div>
              </div>
            ))}
          </>
        )}
        </div>
      </section>
    </ModalFrame>
  );
}

interface AdditionModalForStateProps {
  onDelete: (id: number, recurring: boolean) => void;
  onSaveCap: (cap: PoolCapFormData) => string | null;
  modal: Extract<ModalState, { type: "add-time" | "edit-addition" | "edit-recurring" }>;
  pools: Pool[];
  onClose: () => void;
  onSave: (addition: AdditionFormData) => string | null;
}

function AdditionModalForState({ modal, pools, onClose, onSave, onSaveCap, onDelete }: AdditionModalForStateProps) {
  const pool = pools.find((candidate) => candidate.id === modal.poolId);
  if (!pool) return null;

  if (modal.type === "edit-addition") {
    const addition = pool.additions.find((candidate) => candidate.id === modal.additionId);
    if (!addition) return null;
    return (
      <AdditionModal
        poolName={pool.name}
        mode="edit-one-time"
        onDelete={() => onDelete(addition.id, false)}
        initialReset={addition.reset}
        initialExpiresSameDay={addition.expires_same_day}
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
        onDelete={() => onDelete(rule.id, true)}
        initialReset={rule.reset}
        initialExpiresSameDay={rule.expires_same_day}
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
    <AdditionModal poolName={pool.name} mode="add" onClose={onClose} onSave={onSave} onSaveCap={onSaveCap} />
  );
}

export default App;
