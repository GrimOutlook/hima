import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { addDays, addMonths, isValidDate, prettyDate, todayDate, validDateOrFallback } from "./model";

interface CalendarPickerProps {
  value: string;
  onChange: (date: string) => void;
  label?: string;
  optional?: boolean;
  min?: string;
  selectedDates?: string[];
  onDatesChange?: (dates: string[]) => void;
}

interface CalendarPosition {
  top: number;
  left: number;
  width: number;
}

const CALENDAR_WIDTH = 312;
const CALENDAR_HEIGHT = 430;
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function startOfMonth(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

export function CalendarPicker({ value, onChange, label = "BALANCE ON", optional = false, min, selectedDates, onDatesChange }: CalendarPickerProps) {
  const id = useId();
  const calendarId = `${id}-calendar`;
  const entryId = `${id}-entry`;
  const errorId = `${id}-error`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const lastValidDate = useRef(isValidDate(value) ? value : todayDate());
  const [isOpen, setIsOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(lastValidDate.current);
  const [viewMonth, setViewMonth] = useState(startOfMonth(lastValidDate.current));
  const [error, setError] = useState("");
  const [position, setPosition] = useState<CalendarPosition>({ top: 0, left: 0, width: CALENDAR_WIDTH });
  const dragRef = useRef<{ pointerId: number; start: string; initial: string[]; removing: boolean; dates: string[] } | null>(null);
  const [dragDates, setDragDates] = useState<string[] | null>(null);
  const suppressPointerClick = useRef(false);
  const visibleSelectedDates = dragDates ?? selectedDates;

  function updateDragDate(date: string) {
    const drag = dragRef.current;
    if (!drag || (min && date < min)) return;
    const first = date < drag.start ? date : drag.start;
    const last = date > drag.start ? date : drag.start;
    const range = new Set<string>();
    for (let current = first; current <= last; current = addDays(current, 1)) {
      range.add(current);
      if (current === last) break;
    }
    drag.dates = drag.removing
      ? drag.initial.filter((selected) => !range.has(selected))
      : [...new Set([...drag.initial, ...range])].sort();
    setDragDates(drag.dates);
  }

  useEffect(() => {
    if (!isOpen) {
      dragRef.current = null;
      setDragDates(null);
    }
  }, [isOpen]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(CALENDAR_WIDTH, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    const top = rect.bottom + CALENDAR_HEIGHT + 8 <= window.innerHeight
      ? rect.bottom + 8
      : Math.max(8, rect.top - CALENDAR_HEIGHT - 8);
    setPosition((current) =>
      current.top === top && current.left === left && current.width === width
        ? current
        : { top, left, width },
    );
  }, []);

  useEffect(() => {
    if (isValidDate(value)) {
      lastValidDate.current = value;
      setDraftDate(value);
      setViewMonth(startOfMonth(value));
    } else if (value !== "" || label === "BALANCE ON") {
      const fallback = lastValidDate.current;
      setDraftDate(fallback);
      onChange(fallback);
    }
  }, [label, onChange, value]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || calendarRef.current?.contains(target)) return;
      setIsOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  const monthParts = viewMonth.split("-").map(Number);
  const year = monthParts[0] ?? 0;
  const month = monthParts[1] ?? 1;
  const firstYearOption = Math.min(Math.max(1, year - 40), 9999 - 80);
  const yearOptions = Array.from({ length: 81 }, (_, index) => firstYearOption + index);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const today = todayDate();
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstWeekday + 1;
    if (day < 1 || day > daysInMonth) return null;
    return `${viewMonth.slice(0, 7)}-${String(day).padStart(2, "0")}`;
  });

  function openCalendar() {
    const initialDate = isValidDate(value) ? value : lastValidDate.current;
    setDraftDate(initialDate);
    setViewMonth(startOfMonth(initialDate));
    setError("");
    updatePosition();
    setIsOpen(true);
  }

  function selectDate(candidate: string): boolean {
    if (min && candidate < min) {
      setError(`Choose a date on or after ${prettyDate(min)}.`);
      return false;
    }
    const resolvedDate = validDateOrFallback(candidate, lastValidDate.current);
    if (resolvedDate !== candidate) {
      const fallback = resolvedDate;
      setDraftDate(fallback);
      setError(`Invalid date. Reverted to ${prettyDate(fallback)}.`);
      return false;
    }
    lastValidDate.current = resolvedDate;
    setDraftDate(resolvedDate);
    setViewMonth(startOfMonth(resolvedDate));
    setError("");
    if (selectedDates && onDatesChange) {
      onDatesChange(selectedDates.includes(resolvedDate)
        ? selectedDates.filter((date) => date !== resolvedDate)
        : [...selectedDates, resolvedDate].sort());
      return true;
    }
    onChange(resolvedDate);
    setIsOpen(false);
    triggerRef.current?.focus();
    return true;
  }

  function submitDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    selectDate(draftDate.trim());
  }

  return (
    <div className={label === "BALANCE ON" ? "date-picker" : "date-picker date-picker-field"} ref={rootRef}>
      <span id={`${id}-label`}>{label}</span>
      <button
        ref={triggerRef}
        className="date-picker-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-controls={calendarId}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-expanded={isOpen}
        onClick={() => isOpen ? setIsOpen(false) : openCalendar()}
      >
        <span className="date-picker-value" id={`${id}-value`}>{selectedDates ? `${selectedDates.length} dates selected` : value ? prettyDate(value) : "Choose date"}</span>
        <svg className="date-picker-icon" viewBox="0 0 20 20" aria-hidden="true">
          <rect x="2.75" y="4.5" width="14.5" height="12" rx="2" />
          <path d="M6.5 2.75v3.5M13.5 2.75v3.5M3 8h14" />
        </svg>
      </button>
      {isOpen && createPortal(
        <div
          className="date-picker-calendar"
          id={calendarId}
          ref={calendarRef}
          role="dialog"
          aria-label={`Choose ${label.toLowerCase()}`}
          style={{ top: position.top, left: position.left, width: position.width }}
        >
          <div className="calendar-header">
            <button
              className="calendar-nav-button"
              type="button"
              aria-label="Previous month"
              onClick={() => setViewMonth(addMonths(viewMonth, -1))}
            >
              ‹
            </button>
            <div className="calendar-selectors">
              <select
                className="calendar-month-select"
                aria-label="Choose month"
                value={month}
                onChange={(event) => {
                  const nextMonth = Number(event.currentTarget.value);
                  setViewMonth(`${String(year).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`);
                }}
              >
                {MONTHS.map((monthName, index) => (
                  <option key={monthName} value={index + 1}>{monthName}</option>
                ))}
              </select>
              <select
                className="calendar-year-select"
                aria-label="Choose year"
                value={year}
                onChange={(event) => {
                  const nextYear = Number(event.currentTarget.value);
                  setViewMonth(`${String(nextYear).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`);
                }}
              >
                {yearOptions.map((yearOption) => (
                  <option key={yearOption} value={yearOption}>{yearOption}</option>
                ))}
              </select>
            </div>
            <button
              className="calendar-nav-button"
              type="button"
              aria-label="Next month"
              onClick={() => setViewMonth(addMonths(viewMonth, 1))}
            >
              ›
            </button>
          </div>
          <div className="calendar-weekdays" aria-hidden="true">
            {WEEKDAYS.map((weekday, index) => <span key={`${weekday}-${index}`}>{weekday}</span>)}
          </div>
          <div className={selectedDates ? "calendar-days calendar-days-multiple" : "calendar-days"}>
            {calendarDays.map((date, index) => date ? (
              <button
                className={[
                  "calendar-day",
                  (visibleSelectedDates ? visibleSelectedDates.includes(date) : date === value) ? "is-selected" : "",
                  date === today ? "is-today" : "",
                ].filter(Boolean).join(" ")}
                key={date}
                type="button"
                aria-label={prettyDate(date)}
                aria-pressed={visibleSelectedDates ? visibleSelectedDates.includes(date) : date === value}
                disabled={Boolean(min && date < min)}
                data-date={date}
                onPointerDown={(event) => {
                  if (!selectedDates || !onDatesChange || event.button !== 0 || !event.isPrimary) return;
                  suppressPointerClick.current = true;
                  dragRef.current = { pointerId: event.pointerId, start: date, initial: selectedDates, removing: selectedDates.includes(date), dates: selectedDates };
                  event.currentTarget.setPointerCapture(event.pointerId);
                  updateDragDate(date);
                  setError("");
                }}
                onPointerMove={(event) => {
                  if (dragRef.current?.pointerId !== event.pointerId) return;
                  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLButtonElement>("button[data-date]");
                  if (target && calendarRef.current?.contains(target) && !target.disabled && target.dataset.date) {
                    updateDragDate(target.dataset.date);
                  }
                }}
                onPointerUp={(event) => {
                  const drag = dragRef.current;
                  if (!drag || drag.pointerId !== event.pointerId) return;
                  dragRef.current = null;
                  onDatesChange?.(drag.dates);
                  setDragDates(null);
                }}
                onPointerCancel={() => {
                  dragRef.current = null;
                  setDragDates(null);
                }}
                onLostPointerCapture={() => {
                  dragRef.current = null;
                  setDragDates(null);
                }}
                onClick={(event) => {
                  if (event.detail > 0 && suppressPointerClick.current) {
                    suppressPointerClick.current = false;
                    return;
                  }
                  selectDate(date);
                }}
              >
                {Number(date.slice(-2))}
              </button>
            ) : (
              <span className="calendar-day-empty" key={`empty-${index}`} />
            ))}
          </div>
          <div className="calendar-footer">
            {selectedDates && onDatesChange && <button className="calendar-today-button" type="button" onClick={() => {
              dragRef.current = null;
              setDragDates(null);
              setError("");
              onDatesChange([]);
            }}>Clear</button>}
            {selectedDates && <button className="calendar-today-button" type="button" onClick={() => {
              setIsOpen(false);
              triggerRef.current?.focus();
            }}>Done selecting dates</button>}
            <button className="calendar-today-button" type="button" disabled={Boolean(min && today < min)} onClick={() => selectDate(todayDate())}>
              Go to today
            </button>
            {optional && <button className="calendar-today-button" type="button" onClick={() => {
              onChange("");
              setIsOpen(false);
              triggerRef.current?.focus();
            }}>Clear date</button>}
            <form className="calendar-date-entry" onSubmit={submitDate}>
              <label htmlFor={entryId}>Enter date</label>
              <div>
                <input
                  id={entryId}
                  type="text"
                  inputMode="numeric"
                  placeholder="YYYY-MM-DD"
                  maxLength={10}
                  value={draftDate}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? errorId : undefined}
                  onChange={(event) => {
                    setDraftDate(event.currentTarget.value);
                    setError("");
                  }}
                />
                <button className="calendar-apply-button" type="submit">Go</button>
              </div>
              {error && <p id={errorId} className="calendar-date-error" role="alert">{error}</p>}
            </form>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
