import { Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IgnoreWeekendsContext, isWeekend, TIMELINE_PRESETS, type TimelinePreset } from "./settings";
import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { addMonths, formatHours, formatSignedHours, prettyDate, type BalancePoint, type LeaveEvent, type Pool } from "./model";
import { poolColor } from "./poolColors";
import { chartRangeDates, chartRangeIndices, type ChartIndexRange } from "./chartRange";

interface BalanceChartProps {
  defaultTimeline: TimelinePreset;
  historyDates: string[];
  today: string;
  selectedDate: string;
  onDateChange: (date: string) => void;
  onToday: () => void;
  pools: Pool[];
  onPoolVisibilityChange: (poolId: number, visible: boolean) => void;
  poolHistories: Record<number, BalancePoint[]>;
  selectedEvent?: LeaveEvent;
  zoomEvent?: LeaveEvent;
  eventSelectionRequest?: number;
  zoomToSelectedEvent?: boolean;
  widenSelectedEvent?: boolean;
}

interface ChartPoint extends BalancePoint {
  index: number;
  [key: string]: string | number | boolean | null;
}

const CHART_HEIGHT = 340;
const PLOT_LEFT = 68;
const PLOT_RIGHT = 18;
const ACTUAL_COLOR = "#4b7955";
const PROJECTED_COLOR = "#bd856a";
const RANGE_COLOR = "#a6afa5";
const TICK_STYLE = { fill: "var(--muted)", fontSize: 12, fontFamily: "DM Sans, sans-serif" };
const PRESET_MONTHS = {
  "6 month": -6, "3 month": -3, "1 year": -12, "5 year": -60,
  "future 6 month": 6, "future 3 month": 3, "future 1 year": 12, "future 5 year": 60,
} satisfies Partial<Record<TimelinePreset, number>>;
const PRESET_GROUPS = {
  "all time": "General", "±6 month": "General",
  YTD: "Past", "6 month": "Past", "3 month": "Past", "1 year": "Past", "5 year": "Past", "Previous Year": "Past",
  YFD: "Future", "future 6 month": "Future", "future 3 month": "Future", "future 1 year": "Future", "future 5 year": "Future", "Next Year": "Future",
} satisfies Record<TimelinePreset, string>;

function indexOnOrAfter(history: BalancePoint[], date: string, fallback: number): number {
  const index = history.findIndex((point) => point.date >= date);
  return index < 0 ? fallback : index;
}

function eventHistoryIndices(history: BalancePoint[], event?: LeaveEvent): number[] {
  return [...new Set(event?.days.map((day) => history.findIndex((point) => point.date === day.date)) ?? [])]
    .filter((index) => index >= 0).sort((a, b) => a - b);
}

function ChartDropdown({ className, label, open, onClose, children }: {
  className: string; label: string; open: boolean; onClose: () => void; children: ReactNode;
}) {
  return (
    // Escape from any child control closes this group.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div className={`${className}${open ? " is-open" : ""}`} role="group" aria-label={label}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onClose(); }}
      onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
      {children}
    </div>
  );
}

const TIMELINE_TOOLTIPS: Record<TimelinePreset, string> = {
  "all time": "Show the entire available timeline",
  "±6 month": "Show one year centered on today: six months before and six months after",
  "YTD": "Show January 1 of this year through today",
  "6 month": "Show the past six months through today",
  "3 month": "Show the past three months through today",
  "1 year": "Show the past year through today",
  "5 year": "Show the past five years through today",
  "Previous Year": "Show January 1 through December 31 of last year",
  "YFD": "Show today through December 31 of this year",
  "future 6 month": "Show today through six months from now",
  "future 3 month": "Show today through three months from now",
  "future 1 year": "Show today through one year from now",
  "future 5 year": "Show today through five years from now",
  "Next Year": "Show January 1 through December 31 of next year",
};

function timelineRange(
  preset: TimelinePreset,
  history: BalancePoint[],
  today: string,
  todayIndex: number,
  lastIndex: number,
) {
  if (preset === "all time") return { startIndex: 0, endIndex: lastIndex };
  if (preset === "±6 month") {
    const startDate = addMonths(today, -6);
    const endDate = addMonths(today, 6);
    return { startIndex: indexOnOrAfter(history, startDate, 0), endIndex: indexOnOrAfter(history, endDate, lastIndex) };
  }
  if (preset === "YFD") {
    const endDate = `${today.slice(0, 4)}-12-31`;
    return { startIndex: todayIndex, endIndex: indexOnOrAfter(history, endDate, lastIndex) };
  }
  if (preset === "Next Year" || preset === "Previous Year") {
    const year = Number(today.slice(0, 4)) + (preset === "Next Year" ? 1 : -1);
    return { startIndex: indexOnOrAfter(history, `${year}-01-01`, lastIndex), endIndex: indexOnOrAfter(history, `${year}-12-31`, lastIndex) };
  }
  const months = preset === "YTD" ? 0 : PRESET_MONTHS[preset];
  if (months > 0) {
    const endDate = addMonths(today, months);
    return { startIndex: todayIndex, endIndex: indexOnOrAfter(history, endDate, lastIndex) };
  }

  const startDate = preset === "YTD"
    ? `${today.slice(0, 4)}-01-01`
    : addMonths(today, months);
  return {
    startIndex: indexOnOrAfter(history, startDate, 0),
    endIndex: todayIndex,
  };
}

function BalanceTooltip({
  active,
  payload,
}: TooltipContentProps) {
  const point = payload[0]?.payload as ChartPoint | undefined;
  if (!active || !point) return null;

  return (
    <div className="balance-chart-tooltip">
      <span className="balance-chart-tooltip-date">{prettyDate(point.date)}</span>
      <span className="balance-chart-tooltip-kind">
        <i className={point.projected ? "tooltip-projected-dot" : "tooltip-actual-dot"} />
        {point.projected ? "Projected balance" : "Actual balance"}
      </span>
      {payload.filter((entry) => entry.value != null &&
        (point.projected || !String(entry.dataKey).endsWith("_projected"))).map((entry) => (
        <strong key={String(entry.dataKey)} style={{ color: entry.color }}>
          {entry.name}: {formatHours(Number(entry.value))} h
        </strong>
      ))}
    </div>
  );
}

function monthYearLabel(value: string | undefined): string {
  return value ? prettyDate(value, { day: undefined }) : "";
}

export function BalanceChart({
  defaultTimeline,
  historyDates,
  today,
  selectedDate,
  onDateChange,
  onToday,
  pools,
  onPoolVisibilityChange,
  poolHistories,
  selectedEvent,
  zoomEvent,
  eventSelectionRequest,
  zoomToSelectedEvent,
  widenSelectedEvent,
}: BalanceChartProps) {
  const ignoreWeekends = useContext(IgnoreWeekendsContext);
  const [combinedTotals, setCombinedTotals] = useState(false);
  const [timelineMenuOpen, setTimelineMenuOpen] = useState(false);
  const [poolMenuOpen, setPoolMenuOpen] = useState(false);
  const eventPoolIds = useMemo(() => selectedEvent
    ? new Set(selectedEvent.days.flatMap((day) => day.allocations
      .filter((allocation) => allocation.hours > 0)
      .map((allocation) => allocation.pool_id)))
    : null, [selectedEvent]);
  const selectedPools = useMemo(() => pools.filter((pool) => eventPoolIds
    ? eventPoolIds.has(pool.id)
    : !pool.hidden_from_graph), [pools, eventPoolIds]);
  const selectedPool = selectedPools.length === 1 ? selectedPools[0] : undefined;
  const series = useMemo(() => combinedTotals && selectedPools.length > 0
    ? [{ key: "combined", name: "Combined Totals", color: ACTUAL_COLOR }]
    : selectedPools.map((pool) => ({
      key: `pool_${pool.id}`, name: pool.name,
      color: poolColor(pool.id, pool.color),
    })), [combinedTotals, selectedPools]);
  const fullHistory = useMemo(() => {
    const balances = new Map<string, number>();
    for (const pool of selectedPools) {
      for (const point of poolHistories[pool.id] ?? []) {
        balances.set(point.date, (balances.get(point.date) ?? 0) + point.balance);
      }
    }
    return historyDates.map((date) => ({ date, projected: date > today, balance: balances.get(date) ?? 0 }));
  }, [historyDates, today, poolHistories, selectedPools]);
  const history = useMemo(() => ignoreWeekends
    ? fullHistory.filter((point) => !isWeekend(point.date))
    : fullHistory, [fullHistory, ignoreWeekends]);
  const todayIndex = indexOnOrAfter(history, today, Math.max(0, history.length - 1));
  const todayIsVisible = history[todayIndex]?.date === today;
  const selectedIndex = history.findIndex((point) => point.date === selectedDate);
  const lastIndex = Math.max(0, history.length - 1);
  const [selectedPreset, setSelectedPreset] = useState<TimelinePreset | null>(defaultTimeline);
  const [brushDates, setBrushDates] = useState(() =>
    chartRangeDates(history, timelineRange(defaultTimeline, history, today, todayIndex, lastIndex)),
  );
  const brushRange = chartRangeIndices(history, brushDates);
  const setBrushRange = useCallback((range: ChartIndexRange | ((current: ChartIndexRange) => ChartIndexRange)) => {
    setBrushDates((current) => chartRangeDates(history,
      typeof range === "function" ? range(chartRangeIndices(history, current)) : range));
  }, [history]);
  const selectedPresetRef = useRef<TimelinePreset | null>(defaultTimeline);
  const clearPreset = useCallback(() => {
    selectedPresetRef.current = null;
    setSelectedPreset(null);
  }, []);
  const applyPreset = useCallback((preset: TimelinePreset) => {
    selectedPresetRef.current = preset;
    setSelectedPreset(preset);
    setBrushRange(timelineRange(preset, history, today, todayIndex, lastIndex));
  }, [history, today, todayIndex, lastIndex, setBrushRange]);
  const previousSelectedDate = useRef(selectedDate);
  useEffect(() => {
    const activePreset = selectedPresetRef.current;
    if (activePreset) {
      applyPreset(activePreset);
    }
  }, [applyPreset]);
  useEffect(() => {
    if (previousSelectedDate.current === selectedDate) return;
    previousSelectedDate.current = selectedDate;
    if (
      selectedIndex < 0 ||
      (selectedIndex >= brushRange.startIndex && selectedIndex <= brushRange.endIndex)
    ) return;
    const rangeSize = brushRange.endIndex - brushRange.startIndex;
    const startIndex = Math.max(0, Math.min(selectedIndex - Math.floor(rangeSize / 2), lastIndex - rangeSize));
    setBrushRange({ startIndex, endIndex: Math.min(lastIndex, startIndex + rangeSize) });
    clearPreset();
  }, [selectedDate, selectedIndex, lastIndex, brushRange.startIndex, brushRange.endIndex, setBrushRange, clearPreset]);
  const eventIndices = eventHistoryIndices(history, selectedEvent);
  const highlightedStart = eventIndices[0];
  const highlightedEnd = eventIndices.at(-1);
  useEffect(() => {
    if (highlightedStart === undefined || highlightedEnd === undefined) return;
    const bufferedStart = Math.max(0, highlightedStart - 7);
    const bufferedEnd = Math.min(lastIndex, highlightedEnd + 7);
    if (brushRange.startIndex <= bufferedStart && brushRange.endIndex >= bufferedEnd) return;
    setBrushRange((current) => {
      const size = Math.max(current.endIndex - current.startIndex, bufferedEnd - bufferedStart);
      const startIndex = Math.max(0, Math.min(bufferedStart, Math.max(current.startIndex, bufferedEnd - size), lastIndex - size));
      return { startIndex, endIndex: Math.min(lastIndex, startIndex + size) };
    });
    clearPreset();
  }, [selectedEvent?.id, highlightedStart, highlightedEnd, lastIndex, brushRange.startIndex, brushRange.endIndex, setBrushRange, clearPreset]);
  const zoomIndices = eventHistoryIndices(history, zoomEvent);
  const eventStart = zoomIndices[0];
  const eventEnd = zoomIndices.at(-1);
  useEffect(() => {
    if (eventStart === undefined || eventEnd === undefined) return;
    const bufferedStart = Math.max(0, eventStart - 7);
    const bufferedEnd = Math.min(lastIndex, eventEnd + 7);
    if (zoomToSelectedEvent) {
      setBrushRange({ startIndex: bufferedStart, endIndex: bufferedEnd });
      clearPreset();
      return;
    }
    if (widenSelectedEvent) {
      const startPoint = history[eventStart];
      const endPoint = history[eventEnd];
      if (!startPoint || !endPoint) return;
      const startDate = addMonths(startPoint.date, -6);
      const endDate = addMonths(endPoint.date, 6);
      setBrushRange({ startIndex: indexOnOrAfter(history, startDate, 0), endIndex: indexOnOrAfter(history, endDate, lastIndex) });
      clearPreset();
      return;
    }
  }, [eventSelectionRequest, eventStart, eventEnd, lastIndex, zoomToSelectedEvent, widenSelectedEvent, history, setBrushRange, clearPreset]);
  const chartData = useMemo<ChartPoint[]>(
    () => {
      const balances = Object.fromEntries(selectedPools.map((pool) => [pool.id,
        new Map((poolHistories[pool.id] ?? []).map((point) => [point.date, point.balance])),
      ]));
      return history.map((point, index) => {
        const includesProjection = point.projected || index === todayIndex || (!todayIsVisible && index === todayIndex - 1);
        return {
          ...point,
          index,
          ...Object.fromEntries(series.flatMap((item) => {
            const pool = selectedPools.find((pool) => item.key === `pool_${pool.id}`);
            const balance = pool ? balances[pool.id]?.get(point.date) ?? 0 : point.balance;
            return [[`${item.key}_actual`, point.projected ? null : balance],
              [`${item.key}_projected`, includesProjection ? balance : null]];
          })),
        };
      });
    },
    [history, todayIndex, todayIsVisible, poolHistories, selectedPools, series],
  );
  const todayPoint = fullHistory.find((point) => point.date === today);
  const currentBalance = todayPoint?.balance ?? 0;
  const projectionBalance = fullHistory.find((point) => point.date === addMonths(today, 12))?.balance ?? 0;
  const yearAgoDate = addMonths(today, -12);
  const yearAgoBalance = fullHistory.find((point) => point.date === yearAgoDate)?.balance ?? currentBalance;
  const change = currentBalance - yearAgoBalance;
  const visibleStart = Math.max(0, Math.min(brushRange.startIndex, lastIndex));
  const visibleEnd = Math.max(visibleStart, Math.min(brushRange.endIndex, lastIndex));
  const visibleStartDate = history[visibleStart]?.date ?? today;
  const visibleEndDate = history[visibleEnd]?.date ?? today;
  const values = chartData.slice(visibleStart, visibleEnd + 1).flatMap((point) =>
    series.flatMap((item) => [point[`${item.key}_actual`], point[`${item.key}_projected`]])
      .filter((value): value is number => typeof value === "number"));
  const minBalance = values.length ? Math.min(...values) : 0;
  const maxBalance = values.length ? Math.max(...values) : 0;
  const spread = maxBalance - minBalance;
  const padding = spread < 0.01 ? 1 : spread * 0.12;
  const domain: [number, number] = [minBalance - padding, maxBalance + padding];
  const yTicks = Array.from({ length: 5 }, (_, index) =>
    domain[0] + ((domain[1] - domain[0]) * index) / 4,
  );
  const xTicks = [...new Set([
    visibleStart,
    ...(todayIndex > visibleStart && todayIndex < visibleEnd ? [todayIndex] : []),
    ...(selectedIndex >= visibleStart && selectedIndex <= visibleEnd ? [selectedIndex] : []),
    visibleEnd,
  ])];

  return (
    <section className="history-panel">
      <button className="history-today-button button button-primary button-small" type="button" title="Select today (or the next weekday when weekends are ignored) and clear the selected event." onClick={onToday}>
        Today
      </button>
      <div className="history-panel-header">
        <div>
          <div className="section-overline">BALANCE TIMELINE</div>
          <h2>{selectedPool ? `${selectedPool.name} balance history & outlook` : "PPL balance history & outlook"}</h2>
          <p>
            {selectedPool
              ? `Balance history and a projection through next year for ${selectedPool.name}.`
               : "Balance history and a projection through next year for the selected pools."}
          </p>
          {pools.length > 0 && (
            <div className="history-pool-filter">
              <span>Show</span>
              <ChartDropdown className="history-pool-dropdown" label="Graph pool selection"
                open={poolMenuOpen} onClose={() => setPoolMenuOpen(false)}>
                <button className="history-timeline-preset history-timeline-trigger" type="button"
                  aria-label="Select pools shown in graph" aria-expanded={poolMenuOpen}
                  onClick={() => setPoolMenuOpen((open) => !open)}>
                  {selectedPool?.name ?? `${selectedPools.length} pools selected`}
                  <span aria-hidden="true">▾</span>
                </button>
                <div className="history-pool-options" role="group" aria-label="Pools shown in graph">
                  {pools.map((pool) => (
                    <label key={pool.id}>
                      <input type="checkbox" checked={selectedPools.some((selected) => selected.id === pool.id)}
                        disabled={eventPoolIds !== null}
                        onChange={(event) => onPoolVisibilityChange(pool.id, event.target.checked)} />
                      {pool.name}
                    </label>
                  ))}
                </div>
              </ChartDropdown>
              <span>in graph</span>
              <label className="history-combined-toggle">
                <input type="checkbox" checked={combinedTotals} onChange={(event) => setCombinedTotals(event.target.checked)} />
                Combined Totals
              </label>
            </div>
          )}
        </div>
        <div className="history-metrics">
          <div className="history-change">
            <strong className={change < 0 ? "history-change-negative" : undefined}>
              {formatSignedHours(change)} h
            </strong>
            <span>{selectedPools.length > 1 ? "combined change over past year" : "change over past year"}</span>
          </div>
          <div className="history-projection">
            <strong>{formatHours(projectionBalance)} h</strong>
            <span>{selectedPools.length > 1 ? "combined projection in twelve months" : "projected in twelve months"}</span>
          </div>
        </div>
      </div>
      {selectedPools.length === 0 && <p className="history-pool-visibility">Select a pool to show its balance in the graph.</p>}
      <div className="history-timeline-actions">
      <ChartDropdown className="history-timeline-dropdown" label="Graph timeline selection"
        open={timelineMenuOpen} onClose={() => setTimelineMenuOpen(false)}>
        <button className="history-timeline-preset history-timeline-trigger" type="button"
          aria-expanded={timelineMenuOpen} onClick={() => setTimelineMenuOpen((open) => !open)}>
          Timeline <span aria-hidden="true">▾</span>
        </button>
        <div className="history-timeline-controls" role="group" aria-label="Graph timeline presets">
        {(["General", "Past", "Future"] as const).map((label) => (
          <div className="history-timeline-group" role="group" aria-label={label} key={label}>
            <span className="history-timeline-heading">{label}</span>
            <div className="history-timeline-buttons">
              {TIMELINE_PRESETS.filter((preset) => PRESET_GROUPS[preset] === label).map((preset) => (
                <button
                  key={preset}
                  className={`history-timeline-preset${selectedPreset === preset ? " is-active" : ""}`}
                  type="button"
                  title={TIMELINE_TOOLTIPS[preset]}
                  aria-pressed={selectedPreset === preset}
                  onClick={() => applyPreset(preset)}
                >
                  {preset === "all time" ? "All" : preset.replace(/^future /, "")}
                </button>
              ))}
            </div>
          </div>
        ))}
        </div>
      </ChartDropdown>
      <button className="text-button" type="button" onClick={() => {
        onToday();
        applyPreset(defaultTimeline);
      }}>Reset timeline</button>
      </div>
      <div className="balance-chart-wrap">
        <div
          className="balance-chart-viewport"
          role="group"
          aria-label={`${selectedPool?.name ?? (combinedTotals ? "Combined pools" : "Selected pools")} balance chart with timeline presets, zoom, and pan controls`}
        >
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart
              className="balance-chart-inner"
              data={chartData}
              margin={{ top: 38, right: PLOT_RIGHT, bottom: 0, left: 0 }}
              accessibilityLayer
              onClick={({ activeLabel, isTooltipActive }) => {
                if (!isTooltipActive || activeLabel === undefined) return;
                const point = chartData[Number(activeLabel)];
                if (point) onDateChange(point.date);
              }}
              aria-label={`Daily ${selectedPool?.name ?? (combinedTotals ? "combined pools" : "selected pools")} balance history and forecast through next year`}
            >
              <CartesianGrid stroke="#eeefe9" vertical={false} />
              {visibleEndDate > today && (
                <ReferenceArea
                  x1={Math.max(visibleStart, todayIndex)}
                  x2={visibleEnd}
                  fill="#969d95"
                  fillOpacity={0.16}
                  strokeOpacity={0}
                  ifOverflow="hidden"
                />
              )}
              {eventIndices.map((index) => (
                <ReferenceArea key={`event-day-${index}`} x1={index - 0.5} x2={index + 0.5}
                  fill="#facc15" fillOpacity={0.3} strokeOpacity={0} ifOverflow="hidden" />
              ))}
              <XAxis
                dataKey="index"
                type="number"
                domain={[visibleStart, visibleEnd]}
                ticks={xTicks}
                tickFormatter={(value: number) => todayIsVisible && value === todayIndex
                  ? "Today"
                  : monthYearLabel(history[Math.round(value)]?.date)}
                axisLine={false}
                tickLine={false}
                tickMargin={9}
                height={30}
                tick={TICK_STYLE}
                allowDataOverflow
              />
              <YAxis
                type="number"
                domain={domain}
                ticks={yTicks}
                tickFormatter={(value: number) => `${formatHours(value)} h`}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                width={PLOT_LEFT}
                tick={TICK_STYLE}
                allowDecimals
              />
              {todayIsVisible && <ReferenceLine
                x={todayIndex}
                stroke={RANGE_COLOR}
                strokeDasharray="3 4"
                label={{
                  value: selectedIndex === todayIndex ? "Today · selected date" : "Today",
                  position: "insideTop",
                  fill: "var(--muted)",
                  fontSize: 12,
                  className: "chart-today-label",
                }}
              />}
              {selectedIndex >= 0 && (!todayIsVisible || selectedIndex !== todayIndex) && (
                <ReferenceLine
                  x={selectedIndex}
                  stroke={PROJECTED_COLOR}
                  strokeDasharray="5 4"
                  label={{
                    value: "Selected date",
                    position: "insideBottom",
                    fill: "var(--text-warm)",
                    fontSize: 12,
                    className: "chart-selected-date-label",
                  }}
                />
              )}
              {domain[0] <= 0 && domain[1] >= 0 && (
                <ReferenceLine y={0} stroke="#b8c5b9" strokeDasharray="4 4" />
              )}
              {series.map((item) => (
                <Fragment key={item.key}>
                  <Line name={item.name} dataKey={`${item.key}_actual`} type="monotoneX"
                    stroke={item.color} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  <Line name={`${item.name} (projected)`} dataKey={`${item.key}_projected`} type="monotoneX"
                    stroke={item.color} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                </Fragment>
              ))}
              <Tooltip
                content={(props) => <BalanceTooltip {...props} />}
                cursor={{ stroke: RANGE_COLOR, strokeDasharray: "3 4" }}
                isAnimationActive={false}
              />
              <Brush
                dataKey="index"
                startIndex={brushRange.startIndex}
                endIndex={brushRange.endIndex}
                onChange={({ startIndex, endIndex }) => {
                  setBrushRange({ startIndex, endIndex });
                  clearPreset();
                }}
                ariaLabel="Select a date range to zoom; drag the selected range to pan"
                height={42}
                travellerWidth={10}
                stroke={RANGE_COLOR}
                fill="#f6f7f3"
                tickFormatter={(value) => monthYearLabel(history[Math.round(Number(value))]?.date)}
              >
                <AreaChart margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                  <Area
                    dataKey="balance"
                    type="monotoneX"
                    stroke={ACTUAL_COLOR}
                    strokeWidth={1}
                    fill={ACTUAL_COLOR}
                    fillOpacity={0.12}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </Brush>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="history-footnote">
        {series.map((item) => <span key={item.key} className="history-series-label">
          <i style={{ background: item.color }} />{item.name}
        </span>)}
        <span aria-hidden="true" style={{ width: 16, borderTop: "2px solid #747e74" }} />
        Actual
        <span aria-hidden="true" style={{ width: 16, height: 10, background: "rgba(150, 157, 149, 0.16)", borderTop: "2px solid #747e74" }} />
        Projected
        <span className="history-range">
          {prettyDate(visibleStartDate)} – {prettyDate(visibleEndDate)} · hover for daily balances; click to select a date and scroll to the nearest event; drag the range handles to zoom and the selection to pan
        </span>
      </div>
    </section>
  );
}
