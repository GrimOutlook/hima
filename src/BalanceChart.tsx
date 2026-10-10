import { Fragment, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { addMonths, formatHours, formatSignedHours, monthYearLabel, prettyDate, type BalancePoint, type LeaveEvent, type Pool } from "./model";
import { poolColor } from "./poolColors";
import { chartRangeDates, chartRangeIndices, dateBoundary, type ChartIndexRange } from "./chartRange";

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
const GUIDE_COLOR = "#a6afa5";
const AXIS_TICK_STYLE = { fill: "var(--muted)", fontSize: 12, fontFamily: "DM Sans, sans-serif" };
const CHART_MARGIN = { top: 38, right: PLOT_RIGHT, bottom: 0, left: 0 };
const BRUSH_MARGIN = { top: 2, right: 2, bottom: 2, left: 2 };
const TOOLTIP_CURSOR = { stroke: GUIDE_COLOR, strokeDasharray: "3 4" };
const SELECTED_LABEL = { value: "Selected date", position: "insideBottom" as const, fill: "var(--text-warm)", fontSize: 12, className: "chart-selected-date-label" };
const TODAY_LABEL = { value: "Today", position: "insideTop" as const, fill: "var(--muted)", fontSize: 12, className: "chart-today-label" };
const TODAY_SELECTED_LABEL = { ...TODAY_LABEL, value: "Today · selected date" };
const formatYAxisTick = (value: number) => `${formatHours(value)} h`;
const renderBalanceTooltip = (props: TooltipContentProps) => <BalanceTooltip {...props} />;

const PRESET_GROUPS = ["General", "Past", "Future"] as const;
const PRESET_DETAILS: Record<TimelinePreset, { group: typeof PRESET_GROUPS[number]; months?: number }> = {
  "all time": { group: "General" },
  "±6 month": { group: "General" },
  "YTD": { group: "Past" },
  "6 month": { group: "Past", months: -6 },
  "3 month": { group: "Past", months: -3 },
  "1 year": { group: "Past", months: -12 },
  "5 year": { group: "Past", months: -60 },
  "Previous Year": { group: "Past" },
  "YFD": { group: "Future" },
  "future 6 month": { group: "Future", months: 6 },
  "future 3 month": { group: "Future", months: 3 },
  "future 1 year": { group: "Future", months: 12 },
  "future 5 year": { group: "Future", months: 60 },
  "Next Year": { group: "Future" },
};
const TIMELINE_GROUPS = PRESET_GROUPS.map((label) => ({
  label, presets: TIMELINE_PRESETS.filter((preset) => PRESET_DETAILS[preset].group === label),
}));

function indexOnOrAfter(history: BalancePoint[], date: string, fallback: number): number {
  const index = dateBoundary(history, date);
  return index === history.length ? fallback : index;
}

function eventHistoryIndices(dateIndices: Map<string, number>, event: LeaveEvent | undefined): number[] {
  return [...new Set(event?.days.map((day) =>
    dateIndices.get(day.date) ?? -1) ?? [])]
    .filter((index) => index >= 0).sort((a, b) => a - b);
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
  if (preset.startsWith("future ")) {
    const months = PRESET_DETAILS[preset].months!;
    const endDate = addMonths(today, months);
    return { startIndex: todayIndex, endIndex: indexOnOrAfter(history, endDate, lastIndex) };
  }

  const startDate = preset === "YTD"
    ? `${today.slice(0, 4)}-01-01`
    : addMonths(today, PRESET_DETAILS[preset].months!);
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

function ChartDropdown({ className, label, open, onClose, children }: {
  className: string;
  label: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    // Escape from any child control closes this group.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div className={`${className}${open ? " is-open" : ""}`} role="group" aria-label={label}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}>
      {children}
    </div>
  );
}

export const BalanceChart = memo(function BalanceChart({
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
      key: `pool_${pool.id}`, poolId: pool.id, name: pool.name,
      color: poolColor(pool.id, pool.color),
    })), [combinedTotals, selectedPools]);
  const fullHistory = useMemo(() => {
    return historyDates.map((date, index) => {
      let balance = 0;
      for (const pool of selectedPools) balance += poolHistories[pool.id]?.[index]?.balance ?? 0;
      return { date, projected: date > today, balance };
    });
  }, [historyDates, today, poolHistories, selectedPools]);
  const history = useMemo(() => ignoreWeekends
    ? fullHistory.filter((point) => !isWeekend(point.date))
    : fullHistory, [fullHistory, ignoreWeekends]);
  const todayIndex = indexOnOrAfter(history, today, Math.max(0, history.length - 1));
  const dateIndices = useMemo(() => new Map(history.map((point, index) => [point.date, index])), [history]);
  const fullDateIndices = useMemo(() => new Map(historyDates.map((date, index) => [date, index])), [historyDates]);
  const todayIsVisible = history[todayIndex]?.date === today;
  const selectedIndex = dateIndices.get(selectedDate) ?? -1;
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
  const updateSelectedPreset = useCallback((preset: TimelinePreset | null) => {
    selectedPresetRef.current = preset;
    setSelectedPreset(preset);
  }, []);
  const applyPreset = useCallback((preset: TimelinePreset) => {
    updateSelectedPreset(preset);
    setBrushRange(timelineRange(preset, history, today, todayIndex, lastIndex));
  }, [history, today, todayIndex, lastIndex, setBrushRange, updateSelectedPreset]);
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
    updateSelectedPreset(null);
  }, [selectedDate, selectedIndex, lastIndex, brushRange.startIndex, brushRange.endIndex, setBrushRange, updateSelectedPreset]);
  const eventIndices = useMemo(() => eventHistoryIndices(dateIndices, selectedEvent), [dateIndices, selectedEvent]);
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
    updateSelectedPreset(null);
  }, [selectedEvent?.id, highlightedStart, highlightedEnd, lastIndex, brushRange.startIndex, brushRange.endIndex, setBrushRange, updateSelectedPreset]);
  const zoomIndices = useMemo(() => eventHistoryIndices(dateIndices, zoomEvent), [dateIndices, zoomEvent]);
  const eventStart = zoomIndices[0];
  const eventEnd = zoomIndices.at(-1);
  useEffect(() => {
    if (eventStart === undefined || eventEnd === undefined) return;
    const bufferedStart = Math.max(0, eventStart - 7);
    const bufferedEnd = Math.min(lastIndex, eventEnd + 7);
    if (zoomToSelectedEvent) {
      setBrushRange({ startIndex: bufferedStart, endIndex: bufferedEnd });
      updateSelectedPreset(null);
      return;
    }
    if (widenSelectedEvent) {
      const startPoint = history[eventStart];
      const endPoint = history[eventEnd];
      if (!startPoint || !endPoint) return;
      const startDate = addMonths(startPoint.date, -6);
      const endDate = addMonths(endPoint.date, 6);
      setBrushRange({ startIndex: indexOnOrAfter(history, startDate, 0), endIndex: indexOnOrAfter(history, endDate, lastIndex) });
      updateSelectedPreset(null);
      return;
    }
  }, [eventSelectionRequest, eventStart, eventEnd, lastIndex, zoomToSelectedEvent, widenSelectedEvent, history, setBrushRange, updateSelectedPreset]);
  const chartData = useMemo<ChartPoint[]>(
    () => {
      return history.map((point, index) => {
        const showProjection = point.projected || index === todayIndex || (!todayIsVisible && index === todayIndex - 1);
        const result: ChartPoint = { ...point, index };
        const sourceIndex = fullDateIndices.get(point.date)!;
        for (const item of series) {
          const balance = "poolId" in item ? poolHistories[item.poolId]?.[sourceIndex]?.balance ?? 0 : point.balance;
          result[`${item.key}_actual`] = point.projected ? null : balance;
          result[`${item.key}_projected`] = showProjection ? balance : null;
        }
        return result;
      });
    },
    [history, todayIndex, todayIsVisible, poolHistories, fullDateIndices, series],
  );
  const todayPoint = fullHistory[fullDateIndices.get(today) ?? -1];
  const currentBalance = todayPoint?.balance ?? 0;
  const projectionBalance = fullHistory[fullDateIndices.get(addMonths(today, 12)) ?? -1]?.balance ?? 0;
  const yearAgoDate = addMonths(today, -12);
  const yearAgoBalance = fullHistory[fullDateIndices.get(yearAgoDate) ?? -1]?.balance ?? currentBalance;
  const change = currentBalance - yearAgoBalance;
  const visibleStart = Math.max(0, Math.min(brushRange.startIndex, lastIndex));
  const visibleEnd = Math.max(visibleStart, Math.min(brushRange.endIndex, lastIndex));
  const visibleStartDate = history[visibleStart]?.date ?? today;
  const visibleEndDate = history[visibleEnd]?.date ?? today;
  const [minBalance, maxBalance] = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (let index = visibleStart; index <= visibleEnd; index++) {
      const point = chartData[index];
      if (!point) continue;
      for (const item of series) {
        for (const suffix of ["actual", "projected"]) {
          const value = point[`${item.key}_${suffix}`];
          if (typeof value === "number") { min = Math.min(min, value); max = Math.max(max, value); }
        }
      }
    }
    return min === Infinity ? [0, 0] : [min, max];
  }, [chartData, series, visibleStart, visibleEnd]);
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
  const formatXAxisTick = useCallback((value: number) => todayIsVisible && value === todayIndex
    ? "Today" : monthYearLabel(history[Math.round(value)]?.date), [history, todayIndex, todayIsVisible]);
  const formatBrushTick = useCallback((value: string | number) =>
    monthYearLabel(history[Math.round(Number(value))]?.date), [history]);
  const changeBrush = useCallback(({ startIndex, endIndex }: ChartIndexRange) => {
    setBrushRange({ startIndex, endIndex });
    updateSelectedPreset(null);
  }, [setBrushRange, updateSelectedPreset]);

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
        {TIMELINE_GROUPS.map(({ label, presets }) => (
          <div className="history-timeline-group" role="group" aria-label={label} key={label}>
            <span className="history-timeline-heading">{label}</span>
            <div className="history-timeline-buttons">
              {presets.map((preset) => (
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
              margin={CHART_MARGIN}
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
                tickFormatter={formatXAxisTick}
                axisLine={false}
                tickLine={false}
                tickMargin={9}
                height={30}
                tick={AXIS_TICK_STYLE}
                allowDataOverflow
              />
              <YAxis
                type="number"
                domain={domain}
                ticks={yTicks}
                tickFormatter={formatYAxisTick}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                width={PLOT_LEFT}
                tick={AXIS_TICK_STYLE}
                allowDecimals
              />
              {todayIsVisible && <ReferenceLine
                x={todayIndex}
                stroke={GUIDE_COLOR}
                strokeDasharray="3 4"
                label={selectedIndex === todayIndex ? TODAY_SELECTED_LABEL : TODAY_LABEL}
              />}
              {selectedIndex >= 0 && (!todayIsVisible || selectedIndex !== todayIndex) && (
                <ReferenceLine
                  x={selectedIndex}
                  stroke={PROJECTED_COLOR}
                  strokeDasharray="5 4"
                  label={SELECTED_LABEL}
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
                content={renderBalanceTooltip}
                cursor={TOOLTIP_CURSOR}
                isAnimationActive={false}
              />
              <Brush
                dataKey="index"
                startIndex={brushRange.startIndex}
                endIndex={brushRange.endIndex}
                onChange={changeBrush}
                ariaLabel="Select a date range to zoom; drag the selected range to pan"
                height={42}
                travellerWidth={10}
                stroke={GUIDE_COLOR}
                fill="#f6f7f3"
                tickFormatter={formatBrushTick}
              >
                <AreaChart margin={BRUSH_MARGIN}>
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
});
