import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentProps } from "react";
import { closestCenter, defaultDropAnimationSideEffects, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { defaultAnimateLayoutChanges, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarPicker } from "./CalendarPicker";
import { poolColor } from "./poolColors";
import { parseBackupJson } from "./backup";
import { downloadBackup, downloadJson } from "./backupDownload";
import { ConflictPanel, MigrationScreen, saveStatusLabel } from "./PlannerScreens";
import { EventRow } from "./EventRow";
import { formatPercent, pluralize, selectOnRowClick } from "./presentation";
import { useStoredPlanner } from "./useStoredPlanner";
import { clearBrowserData, exportRawBrowserData } from "./localPersistence";
import { usePoolCardFigures } from "./usePoolCardFigures";
import { FirstDayOfWeekContext, IgnoreWeekendsContext, nextWeekday } from "./settings";
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
  compareDated,
  compareDates,
  compareStartDates,
  eventPoolHours,
  eventTotalHours,
  firstDate,
  formatHours,
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
  const planner = useStoredPlanner();
  const local = planner.mode === "local";
  function recoverBrowserData(clear: boolean) {
    if (clear && !window.confirm("Remove the planner and settings stored in this browser and start fresh? Export raw browser data first to keep a backup.")) return;
    try {
      if (clear) { clearBrowserData(); planner.retry(); }
      else downloadJson(exportRawBrowserData());
    } catch (error) { window.alert(error instanceof Error ? error.message : "Browser storage could not be accessed."); }
  }
  return <>
    {planner.recoveries.map((recovery, index) => <p role="alert" key={index}>
      Unsaved changes from account {recovery.userId} are retained in this page.
      <button className="button" type="button" onClick={() => downloadBackup(recovery.document)}>Export retained backup</button>
    </p>)}
    {planner.phase === "ready" && planner.migration ? <MigrationScreen planner={planner} /> : planner.phase === "ready" ? <>
      {planner.migratedLocal && <section aria-label="Remove migrated browser data">
        <p role="status">Your local planner was saved to your account. Remove the local copy and recovery backups? Keeping them leaves them readable to anyone using this browser and available to other accounts.</p>
        {planner.error && <p role="alert">{planner.error}</p>}
        <button className="button" onClick={() => planner.finishLocalMigration(true)}>Remove local copy and recovery backups</button>
        <button className="button" onClick={() => planner.finishLocalMigration(false)}>Keep local copy</button>
      </section>}
      {planner.saveStatus === "conflict" && <ConflictPanel planner={planner} />}
      <Planner key={planner.generation} planner={planner} />
    </> : <main className="page-content">
      <h1>hima</h1>
      {planner.phase === "loading" ? (
        <p role="status">{local ? "Loading your planner…" : "Loading your account and planner…"}</p>
      ) : planner.phase === "logging-out" ? <p role="status">Signing out…</p> : <>
        {planner.phase === "error" ? <>
          <p role="alert">Could not load your planner: {planner.error}</p>
          <button className="button" type="button" onClick={planner.retry}>Retry loading</button>
          {local && <>
            <button className="button" type="button" onClick={() => recoverBrowserData(false)}>Export raw browser data</button>
            <button className="button" type="button" onClick={() => recoverBrowserData(true)}>Start fresh</button>
          </>}
        </> : <>
          <p>Sign in to load and save your planner.</p>
          <a className="button button-primary" href="/auth/login">Sign in</a>
        </>}
      </>}
    </main>}
  </>;
}

function Planner({ planner }: { planner: ReturnType<typeof useStoredPlanner> }) {
  const { store, setStore, saveStatus, settings: { firstDayOfWeek, ignoreWeekends, defaultTimeline } } = planner;
  const local = planner.mode === "local";
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
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
    left.days[0] ? compareDates(left.days[0].date, right.days[0]?.date ?? "") : 0,
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
  const modalPool = modal && "poolId" in modal
    ? store.pools.find((pool) => pool.id === modal.poolId)
    : undefined;
  const usagePool = modal?.type === "pool-usage" ? modalPool : undefined;
  const informationPool = modal?.type === "pool-info" ? modalPool : undefined;
  const editingCap = modal?.type === "edit-cap"
    ? modalPool?.caps.find((cap) => cap.id === modal.capId)
    : undefined;

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

  function poolCardProps(pool: Pool): PoolCardProps {
    return {
      pool, balanceDate, store,
      selectedEvent,
      isSelected: usesFilterPool?.id === pool.id,
      onSelect: () => setSelectedUsesPoolId((current) => current === pool.id ? null : pool.id),
      onViewUsage: () => setModal({ type: "pool-usage", poolId: pool.id }),
      onViewInformation: () => setModal({ type: "pool-info", poolId: pool.id }),
      onAddTime: () => setModal({ type: "add-time", poolId: pool.id }),
    };
  }

  function createEvent() {
    if (firstPoolId !== undefined) {
      setModal({ type: "new-event", initialDays: [] });
    }
  }

  function selectEvent(id: number) {
    const startDate = firstDate(store.events.find((event) => event.id === id)?.days ?? []);
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

  async function importData(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    try {
      const shouldImportSettings = importSettingsRef.current;
      const warnings: string[] = [];
      const { store: imported, settings } = parseBackupJson(await file.text(), warnings);
      if (!mounted.current) return;
      const restoreSettings = shouldImportSettings && settings !== undefined;
      const confirmed = window.confirm(
        `${warnings.length ? `${warnings.join("\n")}\n\n` : ""}Imported amounts are rounded to hundredths of an hour.\n\n` +
        `Replace ${local ? "this browser's" : "this account's"} planner with ` +
        `${imported.pools.length} ${pluralize(imported.pools.length, "pool")} and ` +
        `${imported.events.length} ${pluralize(imported.events.length, "event")}` +
        `${restoreSettings ? " and restore the backup settings" : ""}? Export a backup first to keep the current copy.`,
      );
      if (!confirmed) return;
      planner.importBackup(imported, restoreSettings ? settings : undefined);
      setBalanceDate(todayDate());
      setModal(null);
    } catch (error) {
      if (!mounted.current) return;
      const message = error instanceof Error ? error.message : "The file could not be read.";
      window.alert(`Could not import data: ${message}`);
    }
  }

  function saveAction(action: StoreAction, nextModal: ModalState | null = null): string | null {
    const error = dispatch(action);
    if (error) return error;
    setModal(nextModal);
    return null;
  }

  function confirmDelete(message: string, action: StoreAction, nextModal: ModalState | null = null) {
    if (window.confirm(message)) saveAction(action, nextModal);
  }

  function removePool(poolId: number, poolName: string) {
    confirmDelete(`Remove ‘${poolName}’ and event days assigned to it?`, { type: "remove-pool", poolId });
  }

  function removeAddition(poolId: number, additionId: number, recurring: boolean) {
    confirmDelete(
      recurring ? "Remove this recurring addition?" : "Remove this one-time addition?",
      { type: "remove-addition", poolId, additionId, recurring },
      { type: "pool-info", poolId },
    );
  }

  function savePool(form: PoolFormData): string | null {
    return saveAction({ type: "save-pool", poolId: modal?.type === "edit-pool" ? modal.poolId : undefined,
      ...form });
  }

  function saveCap(cap: PoolCapFormData): string | null {
    if (modal?.type !== "add-time" && modal?.type !== "edit-cap") return "This pool is no longer available.";
    const capId = modal.type === "edit-cap" ? modal.capId : undefined;
    return saveAction(
      { type: "save-cap", poolId: modal.poolId, capId, cap },
      capId === undefined ? null : { type: "pool-info", poolId: modal.poolId },
    );
  }

  function saveAddition(form: AdditionFormData): string | null {
    if (
      modal?.type !== "add-time" &&
      modal?.type !== "edit-addition" &&
      modal?.type !== "edit-recurring"
    ) {
      return "This addition is no longer available.";
    }
    const poolId = modal.poolId;
    const target = modal.type === "edit-addition" ? { type: "one-time" as const, id: modal.additionId }
      : modal.type === "edit-recurring" ? { type: "recurring" as const, id: modal.ruleId } : undefined;
    return saveAction({ type: "save-addition", poolId, target, form });
  }

  function saveEvent(name: string, days: LeaveDay[]): string | null {
    return saveAction({ type: "save-event", eventId: modal?.type === "edit-event" ? modal.eventId : undefined, name, days });
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
            {saveStatusLabel(saveStatus, planner.revision, local)}
          </span>
          {(saveStatus === "failed" || saveStatus === "conflict") && <button className="button" type="button" onClick={() => downloadBackup(store)}>Export backup</button>}
          {saveStatus === "failed" && <button className="button" type="button" onClick={planner.retry}>Retry save</button>}
          {!local && <button className="button" type="button" onClick={() => { void planner.logout(); }}>Sign out</button>}
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
      {saveStatus === "failed" && <p role="alert">Changes could not be saved: {planner.error} Your edits are retained. Retry saving or export a backup before closing this page.</p>}
      {saveStatus === "conflict" && <p role="alert">
        {local ? "Another tab or window changed this browser's planner." : "The remote planner changed."}
        {" "}Your edits are retained and saving is paused to protect both copies.
        Export a backup before reloading to load the latest {local ? "browser" : "remote"} planner.
      </p>}

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
              <button className="button button-primary button-small" type="button" onClick={() => setModal({ type: "new-pool" })}>
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
                if (over && active.id !== over.id) {
                  dispatch({ type: "reorder-pool", poolId: Number(active.id), targetId: Number(over.id) });
                }
                setDraggedPoolId(null);
              }}
            >
            <SortableContext items={visiblePools.map((pool) => pool.id)} strategy={verticalListSortingStrategy}>
            {store.pools.length === 0 ? (
              <div className="empty-card pool-empty">
                <div className="empty-illustration">✳</div>
                <h3>Start with a pool</h3>
                <p>Give your leave a home. Add a one-off balance now, or set up regular accruals as you go.</p>
                <button className="button button-primary" type="button" onClick={() => setModal({ type: "new-pool" })}>
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
                  {visibleTimeline.map((event) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      fullEvent={store.events.find((candidate) => candidate.id === event.id) ?? event}
                      pools={store.pools}
                      balanceDate={balanceDate}
                      selected={selectedEvent?.id === event.id}
                      zoomed={eventSelection?.id === event.id && eventSelection.zoom}
                      onSelect={() => selectEvent(event.id)}
                      onZoom={() => zoomToEvent(event.id)}
                      onEdit={() => openEditEvent(event)}
                    />
                  ))}
                </div>
              )}

              <div className="events-panel-footer">
                <span>{visibleTimeline.length} {pluralize(visibleTimeline.length, "event")}</span>
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

      {modal?.type === "settings" && <SettingsModal
        firstDayOfWeek={firstDayOfWeek}
        onChange={(firstDayOfWeek) => planner.setSettings({ firstDayOfWeek })}
        ignoreWeekends={ignoreWeekends}
        onIgnoreWeekendsChange={(ignoreWeekends) => planner.setSettings({ ignoreWeekends })}
        defaultTimeline={defaultTimeline}
        onDefaultTimelineChange={(defaultTimeline) => planner.setSettings({ defaultTimeline })}
        onExport={() => downloadBackup(store)}
        onImport={(importSettings) => {
          importSettingsRef.current = importSettings;
          importInputRef.current?.click();
        }}
        browserOnly={local}
        onLogoutEverywhere={!local ? () => { void planner.logoutEverywhere(); } : undefined}
        onClose={closeSettings}
      />}
      {informationPool && (
        <PoolInformationModal
          pool={informationPool}
          store={store}
          balanceDate={balanceDate}
          onEdit={() => setModal({ type: "edit-pool", poolId: informationPool.id })}
          onEditAddition={(additionId) => setModal({ type: "edit-addition", poolId: informationPool.id, additionId })}
          onEditRecurring={(ruleId) => setModal({ type: "edit-recurring", poolId: informationPool.id, ruleId })}
          onEditCap={(capId) => setModal({ type: "edit-cap", poolId: informationPool.id, capId })}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "new-pool" && (
        <PoolModal
          key="new-pool"
          editing={false}
          onClose={() => setModal(null)}
          onSave={savePool}
        />
      )}
      {modal?.type === "edit-pool" && (
        <PoolModal
          key={`edit-pool-${modal.poolId}`}
          editing
          initialName={modalPool?.name ?? ""}
          initialColor={poolColor(modal.poolId, modalPool?.color)}
          initialHiddenFromGraph={modalPool?.hidden_from_graph}
          initialHiddenFromTotal={modalPool?.hidden_from_total}
          initialNewAdditionsExpireSameDay={modalPool?.new_additions_expire_same_day}
          onDelete={() => removePool(modal.poolId, modalPool?.name ?? "")}
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
      {modal?.type === "edit-cap" && modalPool && editingCap && (
        <PoolCapModal
          key={`edit-cap-${editingCap.id}`}
          poolName={modalPool.name}
          editing
          onDelete={() => confirmDelete(
            "Remove this balance cap?",
            { type: "remove-cap", poolId: modalPool.id, capId: editingCap.id },
            { type: "pool-info", poolId: modalPool.id },
          )}
          initialAmount={String(editingCap.max_balance)}
          initialDate={editingCap.start_date}
          initialEndDate={editingCap.end_date}
          onClose={() => setModal({ type: "pool-info", poolId: modalPool.id })}
          onSave={saveCap}
        />
      )}
      {(modal?.type === "add-time" ||
        modal?.type === "edit-addition" ||
        modal?.type === "edit-recurring") && (
        <AdditionModalForState
          key={`${modal.type}-${modal.poolId}-${"additionId" in modal ? modal.additionId : "ruleId" in modal ? modal.ruleId : "new"}`}
          modal={modal}
          onDelete={(id, recurring) => removeAddition(modal.poolId, id, recurring)}
          pools={store.pools}
          onClose={() => setModal(modal.type === "add-time"
            ? null
            : { type: "pool-info", poolId: modal.poolId })}
          onSave={saveAddition}
          onSaveCap={saveCap}
        />
      )}
      {(modal?.type === "new-event" || modal?.type === "edit-event") && (
        <EventModal
          store={store}
          key={modal.type === "new-event" ? "new-event" : `edit-event-${modal.eventId}`}
          pools={store.pools}
          editing={modal.type === "edit-event"}
          eventId={modal.type === "edit-event" ? modal.eventId : undefined}
          onDelete={modal.type === "edit-event" ? () => confirmDelete(
            "Remove this event?", { type: "remove-event", eventId: modal.eventId },
          ) : undefined}
          initialName={modal.type === "edit-event" ? modal.name : ""}
          initialDays={modal.type === "new-event" ? modal.initialDays : modal.days}
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
  onAddTime: () => void;
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
  const eventHours = selectedEvent ? eventPoolHours(selectedEvent, pool.id) : 0;
  const eventTotal = selectedEvent ? eventTotalHours(selectedEvent) : 0;
  const eventPercent = eventHours > 0 ? formatPercent(eventHours, eventTotal) : "0.0";
  return (
    // The title button provides keyboard selection; the card click is a pointer shortcut.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <article
      ref={sortable?.setNodeRef}
      style={{
        transform: CSS.Translate.toString(sortable?.transform ?? null),
        transition: sortable?.transition,
        opacity: sortable?.isDragging ? 0 : undefined,
        height: overlay ? "100%" : undefined,
      }}
      className={`pool-card${isSelected ? " pool-card-selected" : ""}${overlay ? " pool-card-dragging" : ""}`}
      onClick={selectOnRowClick(onSelect, "button, summary")}
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
            aria-label={`${selectedEvent.name} draws ${formatHours(eventHours)} hours from ${pool.name}, ${eventPercent}% of the event total`}>
            <span style={{ width: `${eventHours / eventTotal * 100}%`, backgroundColor: poolColor(pool.id, pool.color) }} />
          </div>
          <span className="pool-event-subtraction-caption">{eventPercent}% of event hours</span>
        </div>
      )}
    </article>
  );
}

interface PoolInformationModalProps {
  pool: Pool;
  store: Store;
  balanceDate: string;
  onEdit: () => void;
  onEditAddition: (id: number) => void;
  onEditRecurring: (id: number) => void;
  onClose: () => void;
  onEditCap: (id: number) => void;
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
}: PoolInformationModalProps) {
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
            {[...pool.caps].sort((left, right) => compareStartDates(right, left)).map((cap) => (
              <div className="rule-row" key={`cap-${cap.id}`}>
                <span className="rule-symbol cap-symbol">≤</span>
                <span className="rule-copy">Maximum balance {formatHours(cap.max_balance)} h</span>
                <span className="rule-date">{prettyDate(cap.start_date)} – {cap.end_date ? prettyDate(cap.end_date) : "ongoing"}</span>
                <div className="rule-actions">
                  <button className="icon-button" type="button" title="Edit balance cap" aria-label="Edit balance cap" onClick={() => onEditCap(cap.id)}>✎</button>
                </div>
              </div>
            ))}
            {[...pool.recurring].sort((left, right) => compareStartDates(right, left)).map((rule) => (
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
            {[...pool.additions].sort((left, right) => compareDated(right, left)).map((addition) => (
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

interface AdditionModalForStateProps extends Pick<ComponentProps<typeof AdditionModal>, "onClose" | "onSave"> {
  onDelete: (id: number, recurring: boolean) => void;
  onSaveCap: (cap: PoolCapFormData) => string | null;
  modal: Extract<ModalState, { type: "add-time" | "edit-addition" | "edit-recurring" }>;
  pools: Pool[];
}

function AdditionModalForState({ modal, pools, onClose, onSave, onSaveCap, onDelete }: AdditionModalForStateProps) {
  const pool = pools.find((candidate) => candidate.id === modal.poolId);
  if (!pool) return null;
  const sharedProps = { poolName: pool.name, onClose, onSave };

  if (modal.type === "edit-addition") {
    const addition = pool.additions.find((candidate) => candidate.id === modal.additionId);
    if (!addition) return null;
    return (
      <AdditionModal
        {...sharedProps}
        mode="edit-one-time"
        onDelete={() => onDelete(addition.id, false)}
        initialReset={addition.reset}
        initialExpiresSameDay={addition.expires_same_day}
        initialAmount={formatHours(addition.amount)}
        initialDate={addition.date}
      />
    );
  }
  if (modal.type === "edit-recurring") {
    const rule = pool.recurring.find((candidate) => candidate.id === modal.ruleId);
    if (!rule) return null;
    return (
      <AdditionModal
        {...sharedProps}
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
      />
    );
  }
  return (
    <AdditionModal {...sharedProps} mode="add" onSaveCap={onSaveCap} />
  );
}

export default App;
