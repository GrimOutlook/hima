import {
  dayLabel, eventDateRangeLabel, eventPoolHours, eventTotalHours, firstDate,
  formatHours, monthLabel, type LeaveEvent, type Pool,
} from "./model";
import { poolColor } from "./poolColors";
import { formatPercent, selectOnRowClick } from "./presentation";

interface EventRowProps {
  event: LeaveEvent;
  fullEvent: LeaveEvent;
  pools: Pool[];
  balanceDate: string;
  selected: boolean;
  zoomed: boolean;
  onSelect: () => void;
  onZoom: () => void;
  onEdit: () => void;
}

function eventBalanceStatus(event: LeaveEvent, balanceDate: string) {
  const includedDays = event.days.filter((day) => day.date <= balanceDate).length;
  if (includedDays === event.days.length) {
    return { className: "event-status event-status-counted", label: "Included in balance" };
  }
  if (includedDays > 0) {
    return { className: "event-status event-status-partial", label: "Partly included" };
  }
  return { className: "event-status", label: "After selected date" };
}

export function EventRow({ event, fullEvent, pools, balanceDate, selected, zoomed, onSelect, onZoom, onEdit }: EventRowProps) {
  const status = eventBalanceStatus(event, balanceDate);
  const startDate = firstDate(event.days) ?? "";
  const totalHours = eventTotalHours(fullEvent);
  // A pool-filtered row shows filtered hours, but its bar still describes the whole event.
  const displayedHours = event === fullEvent ? totalHours : eventTotalHours(event);
  const poolShares = pools.map((pool) => ({ pool, hours: eventPoolHours(fullEvent, pool.id) }))
    .filter((share) => share.hours > 0)
    .map((share) => ({ ...share, percent: formatPercent(share.hours, totalHours) }));
  return (
    // The title button provides keyboard selection; the row click is a pointer shortcut.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <article className={`event-row${selected ? " event-row-selected" : ""}`}
      data-event-id={event.id} onClick={selectOnRowClick(onSelect)}>
      <div className="event-date-block">
        <span className="event-month">{monthLabel(startDate)}</span>
        <strong>{dayLabel(startDate)}</strong>
      </div>
      <div className="event-info">
        <strong><button className="pool-select-button" type="button"
          aria-label={`Highlight ${event.name} in graph`} aria-pressed={selected} onClick={onSelect}
        >{event.name}</button></strong>
        <span>{eventDateRangeLabel(event)}</span>
        <span className={status.className}>{status.label}</span>
      </div>
      <div className="event-amount">−{formatHours(displayedHours)} h</div>
      <div className="event-actions">
        <button className="text-button event-zoom-button" type="button"
          aria-label={`${zoomed ? "Widen timeline around" : "Zoom to"} ${event.name}`} onClick={onZoom}
        >{zoomed ? "Widen" : "Zoom"}</button>
        <button className="icon-button" type="button" title="Edit event" aria-label={`Edit ${event.name}`} onClick={onEdit}>✎</button>
      </div>
      {totalHours > 0 && (
        <div className="event-pool-bar" role="img" aria-label={poolShares.map(({ pool, hours, percent }) =>
          `${pool.name}: ${formatHours(hours)} hours (${percent}%)`,
        ).join(", ")}>
          {poolShares.map(({ pool, hours, percent }) => (
            <span key={pool.id}
              style={{ width: `${hours / totalHours * 100}%`, backgroundColor: poolColor(pool.id, pool.color) }}
              title={`${pool.name}: ${formatHours(hours)} h (${percent}%)`}
            />
          ))}
        </div>
      )}
    </article>
  );
}
