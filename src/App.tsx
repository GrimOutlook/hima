import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { closestCenter, defaultDropAnimationSideEffects, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { defaultAnimateLayoutChanges, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarPicker } from "./CalendarPicker";
import { poolColor } from "./poolColors";
import { parseBackupJson, serializeBackupJson } from "./backup";
import { useStoredPlanner } from "./useStoredPlanner";
import { usePoolCardFigures } from "./usePoolCardFigures";
import { FirstDayOfWeekContext, IgnoreWeekendsContext, loadDefaultTimeline, loadFirstDayOfWeek, loadIgnoreWeekends, nextWeekday, saveSettings } from "./settings";
import {
  AdditionModal,
  PoolCapModal,
  ModalFrame,
  EventModal,
  PoolModal,
  PoolUsageModal,
  SettingsModal,
  eventInputDays,
  type AdditionFormData,
  type PoolCapFormData,
  type PoolFormData,
} from "./Modals";
import {
  reduceStore,
  storeActionError,
  type StoreAction,
  balanceHistoryDates,
  balanceHistoryForDates,
  dayLabel,
  eventDateRangeLabel,
  eventTotalHours,
  formatHours,
  freshEventDays,
  monthLabel,
  poolTotalsOn,
  prettyDate,
  recurringScheduleDescription,
  todayDate,
  totalsOn,
  type EventDayInput,
  type LeaveDay,
  type LeaveEvent,
  type Pool,
  type Store,
} from "./model";

const BalanceChart = lazy(() => import("./BalanceChart").then((module) => ({ default: module.BalanceChart })));

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
  const { store, setStore, storageWarning, saveStatus } = useStoredPlanner();
  function dispatch(action: StoreAction): string | null {
    const error = storeActionError(store, action);
    if (error) return error;
    setStore((current) => reduceStore(current, action));
    return null;
  }
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
  const [selectedUsesPoolId, setSelectedUsesPoolId] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const closeSettings = useCallback(() => {
    setModal(null);
    settingsButtonRef.current?.focus();
  }, []);
  const importInputRef = useRef<HTMLInputElement>(null);
  const importSettingsRef = useRef(false);
  const timelineListRef = useRef<HTMLDivElement>(null);
  const chartHistoryEnd = todayDate();
  const balance = totalsOn(store, balanceDate);
  const historyDates = useMemo(
    () => balanceHistoryDates({ ...store, pools: store.pools.map((pool) => ({ ...pool, hidden_from_graph: false })) }, chartHistoryEnd),
    [store, chartHistoryEnd],
  );
  const poolHistories = useMemo(
    () => {
      return Object.fromEntries(store.pools.map((pool) => [pool.id, balanceHistoryForDates(store, chartHistoryEnd, historyDates, pool.id)]));
    },
    [store, chartHistoryEnd, historyDates],
  );
  const firstPoolId = store.pools[0]?.id;
  const timeline = useMemo(() => [...store.events].sort((left, right) =>
    left.days[0]?.date.localeCompare(right.days[0]?.date ?? "") ?? 0,
  ), [store.events]);
  const usesFilterPool = store.pools.find((pool) => pool.id === selectedUsesPoolId);
  const visibleTimeline = useMemo(() => usesFilterPool
    ? timeline.flatMap((event) => {
        const days = event.days.flatMap((day) => {
          const allocations = day.allocations.filter((allocation) => allocation.pool_id === usesFilterPool.id);
          return allocations.length > 0 ? [{ ...day, allocations }] : [];
        });
        return days.length > 0 ? [{ ...event, days }] : [];
      })
    : timeline, [timeline, usesFilterPool]);
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
    saveSettings(firstDayOfWeek, ignoreWeekends, defaultTimeline);
  }, [firstDayOfWeek, ignoreWeekends, defaultTimeline]);

  const scrollToClosestEvent = useCallback((date: string) => {
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
  }, [visibleTimeline]);

  useEffect(() => {
    scrollToClosestEvent(balanceDate);
  }, [balanceDate, scrollToClosestEvent]);

  function createPool() {
    setModal({ type: "new-pool" });
  }

  function reorderPool(poolId: number, targetId: number) {
    dispatch({ type: "reorder-pool", poolId, targetId });
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
    setHighlightedEventId((current) => current === id ? null : id);
  }

  function zoomToEvent(id: number) {
    setHighlightedEventId(id);
    setEventSelection((current) => ({
      id,
      request: (current?.request ?? 0) + 1,
      zoom: current?.id === id ? !current.zoom : true,
      wide: current?.id === id && current.zoom,
    }));
  }

  function exportData() {
    const blob = new Blob([serializeBackupJson(store, { firstDayOfWeek, ignoreWeekends, defaultTimeline })], { type: "application/json" });
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
      const shouldImportSettings = importSettingsRef.current;
      const warnings: string[] = [];
      const { store: imported, settings } = parseBackupJson(await file.text(), warnings);
      const restoreSettings = shouldImportSettings && settings !== undefined;
      const confirmed = window.confirm(
        `${warnings.length ? `${warnings.join("\n")}\n\n` : ""}Imported amounts are rounded to hundredths of an hour.\n\nReplace the data saved in this browser with ${imported.pools.length} ${imported.pools.length === 1 ? "pool" : "pools"} and ${imported.events.length} ${imported.events.length === 1 ? "event" : "events"}${restoreSettings ? " and restore the backup settings" : ""}?`,
      );
      if (!confirmed) return;
      setStore(imported);
      if (restoreSettings && settings) {
        setFirstDayOfWeek(settings.firstDayOfWeek);
        setIgnoreWeekends(settings.ignoreWeekends);
        setDefaultTimeline(settings.defaultTimeline);
      }
      setBalanceDate(todayDate());
      setModal(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The file could not be read.";
      window.alert(`Could not import data: ${message}`);
    }
  }

  function removePool(poolId: number, poolName: string) {
    if (!window.confirm(`Remove ‘${poolName}’ and event days assigned to it?`)) return;
    dispatch({ type: "remove-pool", poolId });
    setModal(null);
  }

  function removeAddition(poolId: number, additionId: number, recurring: boolean) {
    if (!window.confirm(recurring ? "Remove this recurring addition?" : "Remove this one-time addition?")) return;
    dispatch({ type: "remove-addition", poolId, additionId, recurring });
    setModal({ type: "pool-info", poolId });
  }

  function savePool(form: PoolFormData): string | null {
    const error = dispatch({ type: "save-pool", poolId: selectedModal?.type === "edit-pool" ? selectedModal.poolId : undefined,
      ...form });
    if (error) return error;
    setModal(null);
    return null;
  }

  function saveCap(cap: PoolCapFormData): string | null {
    if (selectedModal?.type !== "add-time" && selectedModal?.type !== "edit-cap") return "This pool is no longer available.";
    const capId = selectedModal.type === "edit-cap" ? selectedModal.capId : undefined;
    const error = dispatch({ type: "save-cap", poolId: selectedModal.poolId, capId, cap });
    if (error) return error;
    setModal(capId === undefined ? null : { type: "pool-info", poolId: selectedModal.poolId });
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
    const target = selectedModal.type === "edit-addition" ? { type: "one-time" as const, id: selectedModal.additionId }
      : selectedModal.type === "edit-recurring" ? { type: "recurring" as const, id: selectedModal.ruleId } : undefined;
    const error = dispatch({ type: "save-addition", poolId, target, form });
    if (error) return error;
    setModal(null);
    return null;
  }

  function saveEvent(name: string, days: LeaveDay[]): string | null {
    const error = dispatch({ type: "save-event", eventId: selectedModal?.type === "edit-event" ? selectedModal.eventId : undefined, name, days });
    if (error) return error;
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
          <span className="privacy-note" role="status">
            {saveStatus === "saved" && <span className="privacy-dot" />}
            {saveStatus === "saved" ? "Saved on this device" : saveStatus === "disabled" ? "Saving disabled" : saveStatus === "failed" ? "Save failed" : "Not yet saved"}
          </span>
          {(saveStatus === "failed" || saveStatus === "disabled") && <button className="button" type="button" onClick={exportData}>Export backup</button>}
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
      {storageWarning && <p role="alert">{storageWarning}</p>}
      {saveStatus === "failed" && <p role="alert">Changes could not be saved on this device. Browser storage may be full or unavailable. Export a backup to keep your changes before closing this page.</p>}

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
            <CalendarPicker variant="balance" value={balanceDate} onChange={setBalanceDate} display="large-date" />
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

        <Suspense fallback={
          <section className="history-panel history-panel-loading" role="status" aria-label="Loading balance chart">
            <div className="section-overline">BALANCE TIMELINE</div>
            <h2>PPL balance history &amp; outlook</h2>
            <div className="balance-chart-loading">Loading balance chart…</div>
          </section>
        }>
        <BalanceChart
          defaultTimeline={defaultTimeline}
          historyDates={historyDates}
          today={chartHistoryEnd}
          selectedDate={balanceDate}
          onDateChange={setBalanceDate}
          onToday={() => {
            setHighlightedEventId(null);
            setEventSelection(null);
            setBalanceDate(ignoreWeekends ? nextWeekday(chartHistoryEnd) : chartHistoryEnd);
          }}
          pools={store.pools}
          onPoolVisibilityChange={(poolId, visible) => { dispatch({ type: "set-pool-visibility", poolId, visible }); }}
          poolHistories={poolHistories}
          selectedEvent={selectedEvent}
          zoomEvent={zoomEvent}
          eventSelectionRequest={eventSelection?.request}
          zoomToSelectedEvent={eventSelection?.zoom}
          widenSelectedEvent={eventSelection?.wide}
        />
        </Suspense>

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
                        }}>
                        <div className="event-date-block">
                          <span className="event-month">{monthLabel(firstDate)}</span>
                          <strong>{dayLabel(firstDate)}</strong>
                        </div>
                        <div className="event-info">
                          <strong><button className="pool-select-button" type="button"
                            aria-label={`Highlight ${event.name} in graph`}
                            aria-pressed={selectedEvent?.id === event.id}
                            onClick={() => selectEvent(event.id)}
                          >{event.name}</button></strong>
                          <span>{eventDateRangeLabel(event)}</span>
                          <span className={statusClass}>{status}</span>
                        </div>
                        <div className="event-amount">−{formatHours(eventTotalHours(event))} h</div>
                        <div className="event-actions">
                          <button
                            className="text-button event-zoom-button"
                            type="button"
                            aria-label={`${eventSelection?.id === event.id && eventSelection.zoom ? "Widen timeline around" : "Zoom to"} ${event.name}`}
                            onClick={() => zoomToEvent(event.id)}
                          >
                            {eventSelection?.id === event.id && eventSelection.zoom ? "Widen" : "Zoom"}
                          </button>
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

      {selectedModal?.type === "settings" && <SettingsModal firstDayOfWeek={firstDayOfWeek} onChange={setFirstDayOfWeek} ignoreWeekends={ignoreWeekends} onIgnoreWeekendsChange={setIgnoreWeekends} defaultTimeline={defaultTimeline} onDefaultTimelineChange={setDefaultTimeline} onExport={exportData} onImport={(importSettings) => {
        importSettingsRef.current = importSettings;
        importInputRef.current?.click();
      }} onClose={closeSettings} />}
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
        return pool && cap ? <PoolCapModal
          key={`edit-cap-${cap.id}`}
          poolName={pool.name}
          editing
          onDelete={() => {
            if (!window.confirm("Remove this balance cap?")) return;
            dispatch({ type: "remove-cap", poolId: pool.id, capId: cap.id });
            setModal({ type: "pool-info", poolId: pool.id });
          }}
          initialAmount={String(cap.max_balance)}
          initialDate={cap.start_date}
          initialEndDate={cap.end_date}
          onClose={() => setModal({ type: "pool-info", poolId: pool.id })}
          onSave={saveCap}
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
          eventId={selectedModal.type === "edit-event" ? selectedModal.eventId : undefined}
          onDelete={selectedModal.type === "edit-event" ? () => {
            if (!window.confirm("Remove this event?")) return;
            dispatch({ type: "remove-event", eventId: selectedModal.eventId });
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
  onAddTime,
  sortable,
  overlay = false,
}: PoolCardProps & { sortable?: ReturnType<typeof useSortable>; overlay?: boolean }) {
  const { currentBalance, dayAdded, dayHours, startingBalance } = usePoolCardFigures(store, pool.id, balanceDate);
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
            <div className="pool-subtitle">{pool.new_additions_expire_same_day ? "Holiday" : "Personal Leave"}</div>
          </div>
        </div>
        <div className="pool-actions">
          {sortable && store.pools.length > 1 && (
            <button
              ref={sortable.setActivatorNodeRef}
              {...sortable.attributes}
              {...sortable.listeners}
              className="icon-button pool-drag-handle"
              type="button"
              title="Reorder pool"
              aria-label={`Reorder ${pool.name}`}
            >
              <span aria-hidden="true">⠿</span>
            </button>
          )}
          <button className="icon-button" type="button" title="Add time / use-by" aria-label={`Add time or use-by date to ${pool.name}`} onClick={onAddTime}>+</button>
          <button className="icon-button" type="button" title="View pool usage" aria-label={`View usage ledger for ${pool.name}`} onClick={onViewUsage}>
            <svg className="ledger-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M7 4.5h11a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 18 19.5H7a2.5 2.5 0 0 1-2.5-2.5V7A2.5 2.5 0 0 1 7 4.5Z" />
              <path d="M7 4.5v15M10 8h6M10 11.5h6M10 15h4" />
            </svg>
          </button>
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
  balanceDate,
  onEdit,
  onEditAddition,
  onEditRecurring,
  onClose,
  onEditCap,
}: PoolCardProps & { onClose: () => void; onEditCap: (id: number) => void }) {
  const lifetimeTotals = poolTotalsOn(store, pool.id, balanceDate);
  return (
    <ModalFrame
      icon="ⓘ"
      title={`${pool.name} information`}
      description={`Lifetime totals through ${prettyDate(balanceDate)}, balance caps and time schedules.`}
      labelledBy="pool-information-title"
      onClose={onClose}
    >
      <div className="pool-lifetime-metrics" aria-label={`Lifetime totals for ${pool.name} through ${prettyDate(balanceDate)}`}>
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
      <div className="modal-actions">
        <button className="icon-button" type="button" title="Edit pool" aria-label={`Edit ${pool.name}`} onClick={onEdit}>⚙</button>
      </div>
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
