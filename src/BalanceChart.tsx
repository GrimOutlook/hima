import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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

interface BalanceChartProps {
  history: BalancePoint[];
  today: string;
  selectedDate: string;
  onDateChange: (date: string) => void;
  pools: Pool[];
  poolHistories: Record<number, BalancePoint[]>;
  selectedEvent?: LeaveEvent;
  eventSelectionRequest?: number;
  zoomToSelectedEvent?: boolean;
  widenSelectedEvent?: boolean;
}

interface ChartPoint extends BalancePoint {
  index: number;
  actualBalance: number | null;
  projectedBalance: number | null;
  [key: string]: string | number | boolean | null;
}

const CHART_HEIGHT = 340;
const PLOT_LEFT = 68;
const PLOT_RIGHT = 18;
const ACTUAL_COLOR = "#4b7955";
const PROJECTED_COLOR = "#bd856a";
const TIMELINE_PRESETS = ["all time", "YTD", "6 month", "3 month", "1 year", "5 year", "YFD", "Next Year"] as const;

type TimelinePreset = typeof TIMELINE_PRESETS[number];

function timelineRange(
  preset: TimelinePreset,
  history: BalancePoint[],
  today: string,
  todayIndex: number,
  lastIndex: number,
) {
  if (preset === "all time") return { startIndex: 0, endIndex: lastIndex };
  if (preset === "YFD") {
    const endDate = addMonths(today, 12);
    const endIndex = history.findIndex((point) => point.date >= endDate);
    return { startIndex: todayIndex, endIndex: endIndex < 0 ? lastIndex : endIndex };
  }
  if (preset === "Next Year") {
    const nextYear = Number(today.slice(0, 4)) + 1;
    const startIndex = history.findIndex((point) => point.date >= `${nextYear}-01-01`);
    const endIndex = history.findIndex((point) => point.date >= `${nextYear}-12-31`);
    return { startIndex: startIndex < 0 ? lastIndex : startIndex, endIndex: endIndex < 0 ? lastIndex : endIndex };
  }

  const startDate = preset === "YTD"
    ? `${today.slice(0, 4)}-01-01`
    : addMonths(today, preset === "6 month" ? -6 : preset === "3 month" ? -3 : preset === "5 year" ? -60 : -12);
  const startIndex = history.findIndex((point) => point.date >= startDate);
  return {
    startIndex: startIndex < 0 ? 0 : startIndex,
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
    <div className="balance-chart-tooltip" role="status">
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
  if (!value) return "";
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function BalanceChart({
  history: timelineHistory,
  today,
  selectedDate,
  onDateChange,
  pools,
  poolHistories,
  selectedEvent,
  eventSelectionRequest,
  zoomToSelectedEvent,
  widenSelectedEvent,
}: BalanceChartProps) {
  const [poolSelections, setPoolSelections] = useState<Record<number, boolean>>({});
  const [combinedTotals, setCombinedTotals] = useState(false);
  const poolDropdownRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function closePoolDropdown(event: PointerEvent) {
      const dropdown = poolDropdownRef.current;
      if (dropdown?.open && event.target instanceof Node && !dropdown.contains(event.target)) {
        dropdown.open = false;
      }
    }
    document.addEventListener("pointerdown", closePoolDropdown);
    return () => document.removeEventListener("pointerdown", closePoolDropdown);
  }, []);
  const selectedPools = pools.filter((pool) => poolSelections[pool.id] ?? !pool.hidden_from_graph);
  const selectedPool = selectedPools.length === 1 ? selectedPools[0] : undefined;
  const series = combinedTotals && selectedPools.length > 0
    ? [{ key: "combined", name: "Combined Totals", color: ACTUAL_COLOR }]
    : selectedPools.map((pool, index) => ({
      key: `pool_${pool.id}`, name: pool.name,
      color: pool.color || [ACTUAL_COLOR, PROJECTED_COLOR, "#547eaa", "#9b6dad", "#ad913e"][index % 5],
    }));
  const history = useMemo(() => {
    const balances = new Map<string, number>();
    for (const pool of selectedPools) {
      for (const point of poolHistories[pool.id] ?? []) {
        balances.set(point.date, (balances.get(point.date) ?? 0) + point.balance);
      }
    }
    return timelineHistory.map((point) => ({ ...point, balance: balances.get(point.date) ?? 0 }));
  }, [timelineHistory, poolHistories, pools, poolSelections]);
  const todayIndex = Math.max(0, history.findIndex((point) => point.date === today));
  const selectedIndex = history.findIndex((point) => point.date === selectedDate);
  const lastIndex = Math.max(0, history.length - 1);
  const [selectedPreset, setSelectedPreset] = useState<TimelinePreset | null>("1 year");
  const [brushRange, setBrushRange] = useState(() =>
    timelineRange("1 year", history, today, todayIndex, lastIndex),
  );
  const selectedPresetRef = useRef<TimelinePreset | null>("1 year");
  const previousSelectedIndex = useRef(selectedIndex);
  useEffect(() => {
    const activePreset = selectedPresetRef.current;
    setBrushRange(activePreset
      ? timelineRange(activePreset, history, today, todayIndex, lastIndex)
      : { startIndex: 0, endIndex: lastIndex });
  }, [history[0]?.date, today, todayIndex, lastIndex]);
  useEffect(() => {
    if (previousSelectedIndex.current === selectedIndex) return;
    previousSelectedIndex.current = selectedIndex;
    if (
      selectedIndex < 0 ||
      (selectedIndex >= brushRange.startIndex && selectedIndex <= brushRange.endIndex)
    ) return;
    const rangeSize = brushRange.endIndex - brushRange.startIndex;
    const startIndex = Math.max(0, Math.min(selectedIndex - Math.floor(rangeSize / 2), lastIndex - rangeSize));
    setBrushRange({ startIndex, endIndex: Math.min(lastIndex, startIndex + rangeSize) });
    selectedPresetRef.current = null;
    setSelectedPreset(null);
  }, [selectedIndex, lastIndex]);
  const eventIndices = [...new Set(selectedEvent?.days.map((day) =>
    history.findIndex((point) => point.date === day.date)) ?? [])].filter((index) => index >= 0).sort((a, b) => a - b);
  const eventStart = eventIndices[0];
  const eventEnd = eventIndices.at(-1);
  useEffect(() => {
    if (eventStart === undefined || eventEnd === undefined) return;
    const bufferedStart = Math.max(0, eventStart - 7);
    const bufferedEnd = Math.min(lastIndex, eventEnd + 7);
    if (zoomToSelectedEvent) {
      setBrushRange({ startIndex: bufferedStart, endIndex: bufferedEnd });
      selectedPresetRef.current = null;
      setSelectedPreset(null);
      return;
    }
    if (widenSelectedEvent) {
      const startDate = addMonths(history[eventStart].date, -6);
      const endDate = addMonths(history[eventEnd].date, 6);
      const startIndex = history.findIndex((point) => point.date >= startDate);
      const endIndex = history.findIndex((point) => point.date >= endDate);
      setBrushRange({ startIndex: Math.max(0, startIndex), endIndex: endIndex < 0 ? lastIndex : endIndex });
      selectedPresetRef.current = null;
      setSelectedPreset(null);
      return;
    }
    if (brushRange.startIndex <= bufferedStart && brushRange.endIndex >= bufferedEnd) return;
    setBrushRange((current) => {
      if (current.startIndex <= bufferedStart && current.endIndex >= bufferedEnd) return current;
      const size = Math.max(current.endIndex - current.startIndex, bufferedEnd - bufferedStart);
      const startIndex = Math.max(0, Math.min(bufferedStart, Math.max(current.startIndex, bufferedEnd - size), lastIndex - size));
      return { startIndex, endIndex: Math.min(lastIndex, startIndex + size) };
    });
    selectedPresetRef.current = null;
    setSelectedPreset(null);
  }, [eventSelectionRequest, eventStart, eventEnd, lastIndex, zoomToSelectedEvent, widenSelectedEvent]);
  const chartData = useMemo<ChartPoint[]>(
    () => {
      const balances = Object.fromEntries(selectedPools.map((pool) => [pool.id,
        new Map((poolHistories[pool.id] ?? []).map((point) => [point.date, point.balance])),
      ]));
      return history.map((point, index) => ({
      ...point,
      index,
      actualBalance: point.projected ? null : point.balance,
      projectedBalance: point.projected || index === todayIndex ? point.balance : null,
      ...Object.fromEntries(series.flatMap((item) => {
        const pool = selectedPools.find((pool) => item.key === `pool_${pool.id}`);
        const balance = pool ? balances[pool.id].get(point.date) ?? 0 : point.balance;
        return [[`${item.key}_actual`, point.projected ? null : balance],
          [`${item.key}_projected`, point.projected || index === todayIndex ? balance : null]];
      })),
    }));
    },
    [history, todayIndex, poolHistories, combinedTotals],
  );
  const todayPoint = history[todayIndex];
  const currentBalance = todayPoint?.balance ?? 0;
  const projectionBalance = history.find((point) => point.date === addMonths(today, 12))?.balance ?? 0;
  const yearAgoDate = addMonths(today, -12);
  const yearAgoBalance = history.find((point) => point.date === yearAgoDate)?.balance ?? currentBalance;
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
      <button className="history-today-button button button-primary button-small" type="button" onClick={() => onDateChange(today)}>
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
              <details ref={poolDropdownRef} className="history-pool-dropdown">
                <summary aria-label="Select pools shown in graph">
                  {selectedPool?.name ?? `${selectedPools.length} pools selected`}
                </summary>
                <div className="history-pool-options" role="group" aria-label="Pools shown in graph">
                  {pools.map((pool) => (
                    <label key={pool.id}>
                      <input type="checkbox" checked={poolSelections[pool.id] ?? !pool.hidden_from_graph}
                        onChange={(event) => setPoolSelections((current) => ({ ...current, [pool.id]: event.target.checked }))} />
                      {pool.name}
                    </label>
                  ))}
                </div>
              </details>
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
      <div className="history-timeline-controls" role="group" aria-label="Graph timeline presets">
        <span>Timeline</span>
        {TIMELINE_PRESETS.map((preset) => (
          <Fragment key={preset}>
            {(preset === "YTD" || preset === "YFD") && (
              <span className="history-timeline-separator" aria-hidden="true" />
            )}
            <button
              className={`history-timeline-preset${selectedPreset === preset ? " is-active" : ""}`}
              type="button"
              aria-pressed={selectedPreset === preset}
              onClick={() => {
                selectedPresetRef.current = preset;
                setSelectedPreset(preset);
                setBrushRange(timelineRange(preset, history, today, todayIndex, lastIndex));
              }}
            >
              {preset === "all time" ? "All" : preset}
            </button>
          </Fragment>
        ))}
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
              {eventIndices.map((index) => (
                <ReferenceArea key={`event-day-${index}`} x1={index - 0.5} x2={index + 0.5}
                  fill="#facc15" fillOpacity={0.3} strokeOpacity={0} ifOverflow="hidden" />
              ))}
              <XAxis
                dataKey="index"
                type="number"
                domain={[visibleStart, visibleEnd]}
                ticks={xTicks}
                tickFormatter={(value: number) => value === todayIndex
                  ? "Today"
                  : monthYearLabel(history[Math.round(value)]?.date)}
                axisLine={false}
                tickLine={false}
                tickMargin={9}
                height={30}
                tick={{ fill: "#969d95", fontSize: 10, fontFamily: "DM Sans, sans-serif" }}
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
                tick={{ fill: "#969d95", fontSize: 10, fontFamily: "DM Sans, sans-serif" }}
                allowDecimals
              />
              <ReferenceLine
                x={todayIndex}
                stroke="#a6afa5"
                strokeDasharray="3 4"
                label={{
                  value: selectedIndex === todayIndex ? "Today · selected date" : "Today",
                  position: "insideTop",
                  fill: "#747e74",
                  fontSize: 9,
                  className: "chart-today-label",
                }}
              />
              {selectedIndex >= 0 && selectedIndex !== todayIndex && (
                <ReferenceLine
                  x={selectedIndex}
                  stroke={PROJECTED_COLOR}
                  strokeDasharray="5 4"
                  label={{
                    value: "Selected date",
                    position: "insideBottom",
                    fill: PROJECTED_COLOR,
                    fontSize: 9,
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
                    stroke={item.color} strokeWidth={2.5} strokeDasharray="7 5" dot={false} isAnimationActive={false} />
                </Fragment>
              ))}
              <Tooltip
                content={(props) => <BalanceTooltip {...props} />}
                cursor={{ stroke: "#a6afa5", strokeDasharray: "3 4" }}
                isAnimationActive={false}
              />
              <Brush
                dataKey="index"
                startIndex={brushRange.startIndex}
                endIndex={brushRange.endIndex}
                onChange={({ startIndex, endIndex }) => {
                  setBrushRange({ startIndex, endIndex });
                  selectedPresetRef.current = null;
                  setSelectedPreset(null);
                }}
                ariaLabel="Select a date range to zoom; drag the selected range to pan"
                height={42}
                travellerWidth={10}
                stroke="#a6afa5"
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
        <span aria-hidden="true" style={{ width: 16, borderTop: "2px dashed #747e74" }} />
        Projected
        <span className="history-range">
          {prettyDate(visibleStartDate)} – {prettyDate(visibleEndDate)} · hover for daily balances; click to select a date; drag the range handles to zoom and the selection to pan
        </span>
      </div>
    </section>
  );
}
