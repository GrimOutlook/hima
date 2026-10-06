import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { formatHours, formatSignedHours, prettyDate, type BalancePoint } from "./model";

interface BalanceChartProps {
  history: BalancePoint[];
  today: string;
  selectedDate: string;
}

interface ChartPoint extends BalancePoint {
  index: number;
  actualBalance: number | null;
  projectedBalance: number | null;
}

const CHART_HEIGHT = 340;
const PLOT_LEFT = 68;
const PLOT_RIGHT = 18;
const ACTUAL_COLOR = "#4b7955";
const PROJECTED_COLOR = "#bd856a";

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
      <strong>{formatHours(point.balance)} h</strong>
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

export function BalanceChart({ history, today, selectedDate }: BalanceChartProps) {
  const todayIndex = Math.max(0, history.findIndex((point) => point.date === today));
  const selectedIndex = history.findIndex((point) => point.date === selectedDate);
  const lastIndex = Math.max(0, history.length - 1);
  const [brushRange, setBrushRange] = useState({ startIndex: 0, endIndex: lastIndex });
  const previousSelectedIndex = useRef(selectedIndex);
  useEffect(() => {
    setBrushRange({ startIndex: 0, endIndex: lastIndex });
  }, [lastIndex]);
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
  }, [selectedIndex, lastIndex]);
  const chartData = useMemo<ChartPoint[]>(
    () => history.map((point, index) => ({
      ...point,
      index,
      actualBalance: point.projected ? null : point.balance,
      projectedBalance: point.projected || index === todayIndex ? point.balance : null,
    })),
    [history, todayIndex],
  );
  const startBalance = history[0]?.balance ?? 0;
  const todayPoint = [...history].reverse().find((point) => !point.projected);
  const currentBalance = todayPoint?.balance ?? 0;
  const projectionBalance = history.at(-1)?.balance ?? 0;
  const change = currentBalance - startBalance;
  const startDate = history[0]?.date ?? today;
  const endDate = history.at(-1)?.date ?? today;
  const values = history.map((point) => point.balance);
  const minBalance = values.length ? Math.min(...values) : 0;
  const maxBalance = values.length ? Math.max(...values) : 0;
  const spread = maxBalance - minBalance;
  const padding = spread < 0.01 ? 1 : spread * 0.12;
  const domain: [number, number] = [minBalance - padding, maxBalance + padding];
  const yTicks = Array.from({ length: 5 }, (_, index) =>
    domain[0] + ((domain[1] - domain[0]) * index) / 4,
  );
  const visibleStart = Math.max(0, Math.min(brushRange.startIndex, lastIndex));
  const visibleEnd = Math.max(visibleStart, Math.min(brushRange.endIndex, lastIndex));
  const xTicks = [...new Set([
    visibleStart,
    ...(todayIndex > visibleStart && todayIndex < visibleEnd ? [todayIndex] : []),
    ...(selectedIndex >= visibleStart && selectedIndex <= visibleEnd ? [selectedIndex] : []),
    visibleEnd,
  ])];

  return (
    <section className="history-panel">
      <div className="history-panel-header">
        <div>
          <div className="section-overline">A YEAR AT A GLANCE</div>
          <h2>PPL balance history &amp; outlook</h2>
          <p>Past year and twelve-month projection across all pools.</p>
        </div>
        <div className="history-metrics">
          <div className="history-change">
            <strong className={change < 0 ? "history-change-negative" : undefined}>
              {formatSignedHours(change)} h
            </strong>
            <span>change over past year</span>
          </div>
          <div className="history-projection">
            <strong>{formatHours(projectionBalance)} h</strong>
            <span>projected in twelve months</span>
          </div>
        </div>
      </div>
      <div className="balance-chart-wrap">
        <div
          className="balance-chart-viewport"
          role="group"
          aria-label="PPL balance chart with zoom and pan controls"
        >
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <AreaChart
              className="balance-chart-inner"
              data={chartData}
              margin={{ top: 38, right: PLOT_RIGHT, bottom: 0, left: 0 }}
              accessibilityLayer
              aria-label="Daily combined PPL balance and forecast for the past and coming year"
            >
              <CartesianGrid stroke="#eeefe9" vertical={false} />
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
              <Area
                name="Actual"
                dataKey="actualBalance"
                type="monotoneX"
                baseValue={domain[0]}
                stroke={ACTUAL_COLOR}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill={ACTUAL_COLOR}
                fillOpacity={0.1}
                connectNulls={false}
                dot={false}
                activeDot={{ r: 5, fill: "#fff", stroke: ACTUAL_COLOR, strokeWidth: 2 }}
                isAnimationActive={false}
              />
              <Area
                name="Projected"
                dataKey="projectedBalance"
                type="monotoneX"
                baseValue={domain[0]}
                stroke={PROJECTED_COLOR}
                strokeWidth={2.5}
                strokeDasharray="7 5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill={PROJECTED_COLOR}
                fillOpacity={0.1}
                connectNulls={false}
                dot={false}
                activeDot={{ r: 5, fill: "#fff", stroke: PROJECTED_COLOR, strokeWidth: 2 }}
                isAnimationActive={false}
              />
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
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="history-footnote">
        <span className="history-legend-dot" />
        Actual
        <span className="history-projection-dot" />
        Projected
        <span className="history-range">
          {prettyDate(startDate)} – {prettyDate(endDate)} · hover for daily balances; drag the range handles to zoom and the selection to pan
        </span>
      </div>
    </section>
  );
}
