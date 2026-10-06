import { useLayoutEffect, useRef } from "react";
import { chartLayout, formatHours, formatSignedHours, prettyDate, type BalancePoint } from "./model";

interface BalanceChartProps {
  history: BalancePoint[];
  today: string;
}

export function BalanceChart({ history, today }: BalanceChartProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const chart = chartLayout(history);
  const startBalance = history[0]?.balance ?? 0;
  const todayPoint = [...history].reverse().find((point) => !point.projected);
  const currentBalance = todayPoint?.balance ?? 0;
  const projectionBalance = history.at(-1)?.balance ?? 0;
  const change = currentBalance - startBalance;
  const startDate = history[0]?.date ?? today;
  const endDate = history.at(-1)?.date ?? today;

  useLayoutEffect(() => {
    const chartElement = scrollRef.current;
    if (chartElement) {
      chartElement.scrollLeft = Math.max(0, chart.todayX - chartElement.clientWidth / 2);
    }
  }, [chart.todayX]);

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
          id="balance-chart-scroll"
          className="balance-chart-scroll"
          ref={scrollRef}
          aria-label="Scrollable PPL balance chart"
          tabIndex={0}
        >
          <svg
            className="balance-chart-svg"
            width={chart.width}
            height="290"
            viewBox={`0 0 ${chart.width} 290`}
            role="img"
            aria-labelledby="balance-chart-title"
          >
            <title id="balance-chart-title">
              Daily combined PPL balance and forecast for the past and coming year
            </title>
            <path className="history-area" d={chart.historyAreaPath} />
            <path className="projection-area" d={chart.projectionAreaPath} />
            {chart.ticks.map((tick, index) => (
              <g key={index}>
                <line
                  className={tick.isZero ? "chart-grid chart-grid-zero" : "chart-grid"}
                  x1="68"
                  x2={chart.width - 18}
                  y1={tick.y}
                  y2={tick.y}
                />
                <text className="chart-y-label" x="60" y={tick.y + 4} textAnchor="end">
                  {tick.label}
                </text>
              </g>
            ))}
            {chart.zeroY !== null && (
              <line
                className="chart-grid chart-grid-zero"
                x1="68"
                x2={chart.width - 18}
                y1={chart.zeroY}
                y2={chart.zeroY}
              />
            )}
            <line
              className="chart-today-line"
              x1={chart.todayX}
              x2={chart.todayX}
              y1="18"
              y2="232"
            />
            <text className="chart-today-label" x={chart.todayX} y="13" textAnchor="middle">
              Today
            </text>
            <path className="history-line" d={chart.historyLinePath} />
            <path className="projection-line" d={chart.projectionLinePath} />
            <circle className="history-last-point" cx={chart.todayX} cy={chart.todayY} r="4.5" />
            <circle
              className="projection-last-point"
              cx={chart.projectionX}
              cy={chart.projectionY}
              r="4"
            />
            {chart.dateLabels.map((label, index) => (
              <text
                className="chart-x-label"
                key={`${label.x}-${index}`}
                x={label.x}
                y="274"
                textAnchor={label.anchor}
              >
                {label.label}
              </text>
            ))}
          </svg>
        </div>
      </div>
      <div className="history-footnote">
        <span className="history-legend-dot" />
        Actual
        <span className="history-projection-dot" />
        Projected
        <span className="history-range">
          {prettyDate(startDate)} – {prettyDate(endDate)} · scroll horizontally to explore
        </span>
      </div>
    </section>
  );
}
