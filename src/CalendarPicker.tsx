import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { addMonths, isValidDate, prettyDate, todayDate, validDateOrFallback } from "./model";

interface CalendarPickerProps {
  value: string;
  onChange: (date: string) => void;
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

export function CalendarPicker({ value, onChange }: CalendarPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const lastValidDate = useRef(isValidDate(value) ? value : todayDate());
  const [isOpen, setIsOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(lastValidDate.current);
  const [viewMonth, setViewMonth] = useState(startOfMonth(lastValidDate.current));
  const [error, setError] = useState("");
  const [position, setPosition] = useState<CalendarPosition>({ top: 0, left: 0, width: CALENDAR_WIDTH });

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
    } else {
      const fallback = lastValidDate.current;
      setDraftDate(fallback);
      onChange(fallback);
    }
  }, [onChange, value]);

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
    onChange(resolvedDate);
    setIsOpen(false);
    triggerRef.current?.focus();
    return true;
  }

  function submitDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    selectDate(draftDate.trim());
  }

  return (
    <div className="date-picker" ref={rootRef}>
      <span>BALANCE ON</span>
      <button
        ref={triggerRef}
        className="date-picker-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-controls="balance-date-calendar"
        aria-expanded={isOpen}
        onClick={() => isOpen ? setIsOpen(false) : openCalendar()}
      >
        <span className="date-picker-value">{prettyDate(value)}</span>
        <svg className="date-picker-icon" viewBox="0 0 20 20" aria-hidden="true">
          <rect x="2.75" y="4.5" width="14.5" height="12" rx="2" />
          <path d="M6.5 2.75v3.5M13.5 2.75v3.5M3 8h14" />
        </svg>
      </button>
      {isOpen && createPortal(
        <div
          className="date-picker-calendar"
          id="balance-date-calendar"
          ref={calendarRef}
          role="dialog"
          aria-label="Choose balance date"
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
          <div className="calendar-days">
            {calendarDays.map((date, index) => date ? (
              <button
                className={[
                  "calendar-day",
                  date === value ? "is-selected" : "",
                  date === today ? "is-today" : "",
                ].filter(Boolean).join(" ")}
                key={date}
                type="button"
                aria-label={prettyDate(date)}
                aria-pressed={date === value}
                onClick={() => selectDate(date)}
              >
                {Number(date.slice(-2))}
              </button>
            ) : (
              <span className="calendar-day-empty" key={`empty-${index}`} />
            ))}
          </div>
          <div className="calendar-footer">
            <button className="calendar-today-button" type="button" onClick={() => selectDate(todayDate())}>
              Go to today
            </button>
            <form className="calendar-date-entry" onSubmit={submitDate}>
              <label htmlFor="calendar-date-entry">Enter date</label>
              <div>
                <input
                  id="calendar-date-entry"
                  type="text"
                  inputMode="numeric"
                  placeholder="YYYY-MM-DD"
                  maxLength={10}
                  value={draftDate}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "calendar-date-error" : undefined}
                  onChange={(event) => {
                    setDraftDate(event.currentTarget.value);
                    setError("");
                  }}
                />
                <button className="calendar-apply-button" type="submit">Go</button>
              </div>
              {error && <p id="calendar-date-error" className="calendar-date-error" role="alert">{error}</p>}
            </form>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
