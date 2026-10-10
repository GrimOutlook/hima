import { createPortal } from "react-dom";
import { useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { addDays, addMonths, formatDateParts, isValidDate, MIN_YEAR, MAX_YEAR, MONTH_NAMES, prettyDate, todayDate, WEEKDAYS } from "./model";
import { FirstDayOfWeekContext, IgnoreWeekendsContext, isWeekend, nextWeekday } from "./settings";

interface CalendarPickerProps {
  value: string;
  onChange: (date: string) => void;
  label?: string;
  variant?: "balance" | "field";
  display?: "large-date";
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

function startOfMonth(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

export function CalendarPicker({ value, onChange, label = "BALANCE ON", variant = "field", display, optional = false, min, selectedDates, onDatesChange }: CalendarPickerProps) {
  const firstDayOfWeek = useContext(FirstDayOfWeekContext);
  const ignoreWeekends = useContext(IgnoreWeekendsContext);
  const weekStart = WEEKDAYS.indexOf(firstDayOfWeek);
  const weekdays = [...WEEKDAYS.slice(weekStart), ...WEEKDAYS.slice(0, weekStart)];
  const id = useId();
  const calendarId = `${id}-calendar`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const lastValidDate = useRef(isValidDate(value) ? value : todayDate());
  const [isOpen, setIsOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(startOfMonth(lastValidDate.current));
  const [focusedDate, setFocusedDate] = useState(lastValidDate.current);
  const focusDayPending = useRef(false);
  const closing = useRef(false);

  function closeCalendar() {
    closing.current = true;
    setIsOpen(false);
  }
  const [error, setError] = useState("");
  const [position, setPosition] = useState<CalendarPosition>({ top: 0, left: 0, width: CALENDAR_WIDTH });
  const dragRef = useRef<{ pointerId: number; start: string; initial: string[]; removing: boolean; dates: string[] } | null>(null);
  const [dragDates, setDragDates] = useState<string[] | null>(null);
  const suppressPointerClick = useRef(false);
  const visibleSelectedDates = dragDates ?? selectedDates;

  function updateDragDate(date: string) {
    const drag = dragRef.current;
    if (!drag || (min && date < min) || (ignoreWeekends && isWeekend(date))) return;
    const first = date < drag.start ? date : drag.start;
    const last = date > drag.start ? date : drag.start;
    const range = new Set<string>();
    for (let current = first; current <= last; current = addDays(current, 1)) {
      if (!ignoreWeekends || !isWeekend(current)) range.add(current);
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
      setViewMonth(startOfMonth(value));
    } else if (value !== "" || variant === "balance") {
      const fallback = lastValidDate.current;
      onChange(fallback);
    }
  }, [variant, onChange, value]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
  }, [isOpen, updatePosition]);

  useLayoutEffect(() => {
    if (!isOpen || !focusDayPending.current) return;
    calendarRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focusedDate}"]`)?.focus();
    focusDayPending.current = false;
  }, [isOpen, focusedDate, viewMonth]);

  useEffect(() => {
    if (!isOpen) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || calendarRef.current?.contains(target)) return;
      closeCalendar();
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeCalendar();
      triggerRef.current?.focus();
    }

    function containFocus(event: FocusEvent) {
      if (closing.current) return;
      if (calendarRef.current?.contains(event.target as Node)) return;
      (calendarRef.current?.querySelector<HTMLElement>('[data-date][tabindex="0"]') ?? calendarRef.current)?.focus();
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape, true);
    document.addEventListener("focusin", containFocus);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape, true);
      document.removeEventListener("focusin", containFocus);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  const monthParts = viewMonth.split("-").map(Number);
  const year = monthParts[0] ?? 0;
  const month = monthParts[1] ?? 1;
  const firstYearOption = Math.min(Math.max(MIN_YEAR, year - 40), MAX_YEAR - 80);
  const yearOptions = Array.from({ length: 81 }, (_, index) => firstYearOption + index);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() - weekStart + 7) % 7;
  const today = todayDate();
  const todaySelection = ignoreWeekends ? nextWeekday(today) : today;
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstWeekday + 1;
    if (day < 1 || day > daysInMonth) return null;
    return formatDateParts(year, month, day);
  });

  function openCalendar() {
    closing.current = false;
    const selectedDate = selectedDates ? selectedDates[selectedDates.length - 1] : value;
    let initialDate = selectedDate && isValidDate(selectedDate) ? selectedDate : todayDate();
    if (min && initialDate < min) initialDate = min;
    if (ignoreWeekends) initialDate = nextWeekday(initialDate);
    setFocusedDate(initialDate);
    focusDayPending.current = true;
    setViewMonth(startOfMonth(initialDate));
    setError("");
    updatePosition();
    setIsOpen(true);
  }

  const enabledDays = calendarDays.filter((date): date is string => Boolean(date && (!min || date >= min) && (!ignoreWeekends || !isWeekend(date))));
  const tabDate = enabledDays.includes(focusedDate) ? focusedDate : enabledDays[0];

  function navigateDay(event: React.KeyboardEvent<HTMLButtonElement>, date: string) {
    const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() - weekStart + 7) % 7;
    let candidate: string;
    let direction = 1;
    switch (event.key) {
      case "ArrowLeft": candidate = addDays(date, -1); direction = -1; break;
      case "ArrowRight": candidate = addDays(date, 1); break;
      case "ArrowUp": candidate = addDays(date, -7); direction = -1; break;
      case "ArrowDown": candidate = addDays(date, 7); break;
      case "Home": candidate = addDays(date, -weekday); break;
      case "End": candidate = addDays(date, 6 - weekday); direction = -1; break;
      case "PageUp": candidate = addMonths(date, event.shiftKey ? -12 : -1); direction = -1; break;
      case "PageDown": candidate = addMonths(date, event.shiftKey ? 12 : 1); break;
      default: return;
    }
    event.preventDefault();
    if (min && candidate < min) { candidate = min; direction = 1; }
    while (isValidDate(candidate) && ignoreWeekends && isWeekend(candidate)) candidate = addDays(candidate, direction);
    if (!isValidDate(candidate) || (min && candidate < min)) return;
    focusDayPending.current = true;
    setFocusedDate(candidate);
    setViewMonth(startOfMonth(candidate));
  }

  function selectDate(candidate: string): boolean {
    if (ignoreWeekends && isWeekend(candidate)) {
      setError("Choose a weekday. Weekends are ignored in Settings.");
      return false;
    }
    if (min && candidate < min) {
      setError(`Choose a date on or after ${prettyDate(min)}.`);
      return false;
    }
    if (!isValidDate(candidate)) {
      const fallback = lastValidDate.current;
      setError(`Invalid date. Reverted to ${prettyDate(fallback)}.`);
      return false;
    }
    lastValidDate.current = candidate;
    setViewMonth(startOfMonth(candidate));
    setError("");
    if (selectedDates && onDatesChange) {
      onDatesChange(selectedDates.includes(candidate)
        ? selectedDates.filter((date) => date !== candidate)
        : [...selectedDates, candidate].sort());
      return true;
    }
    onChange(candidate);
    closeCalendar();
    triggerRef.current?.focus();
    return true;
  }

  return (
    <div className={display === "large-date" ? "date-picker date-picker-large" : variant === "balance" ? "date-picker" : "date-picker date-picker-field"} ref={rootRef}>
      {display !== "large-date" && <span id={`${id}-label`}>{label}</span>}
      <button
        ref={triggerRef}
        className="date-picker-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-controls={calendarId}
        aria-labelledby={display === "large-date" ? `${id}-value` : `${id}-label ${id}-value`}
        aria-expanded={isOpen}
        onClick={() => isOpen ? closeCalendar() : openCalendar()}
      >
        <span className="date-picker-value" id={`${id}-value`}>{selectedDates ? selectedDates.length === 1 && selectedDates[0] !== undefined ? prettyDate(selectedDates[0]) : `${selectedDates.length} dates selected` : value ? prettyDate(value) : "Choose date"}</span>
        <svg className="date-picker-icon" viewBox="0 0 20 20" aria-hidden="true">
          <rect x="2.75" y="4.5" width="14.5" height="12" rx="2" />
          <path d="M6.5 2.75v3.5M13.5 2.75v3.5M3 8h14" />
        </svg>
      </button>
      {isOpen && createPortal(
        // The dialog handles Tab to keep focus within its native controls.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div
          className="date-picker-calendar"
          id={calendarId}
          ref={calendarRef}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          aria-label={`Choose ${label.toLowerCase()}`}
          onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            const controls = Array.from(calendarRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select, [tabindex="0"]') ?? []).filter((control) => control.tabIndex >= 0);
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey ? document.activeElement === first : document.activeElement === last) {
              event.preventDefault();
              (event.shiftKey ? last : first)?.focus();
            }
          }}
          style={{ top: position.top, left: position.left, width: position.width }}
        >
          <button className="calendar-footer-button calendar-clear-button calendar-top-today" type="button" disabled={Boolean(min && todaySelection < min)} onClick={() => selectDate(todaySelection)}>
            Today
          </button>
          <div className="calendar-header">
            <button
              className="calendar-nav-button"
              type="button"
              aria-label="Previous month"
              disabled={year === MIN_YEAR && month === 1}
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
                  setViewMonth(formatDateParts(year, nextMonth, 1));
                }}
              >
                {MONTH_NAMES.map((monthName, index) => (
                  <option key={monthName} value={index + 1}>{monthName}</option>
                ))}
              </select>
              <select
                className="calendar-year-select"
                aria-label="Choose year"
                value={year}
                onChange={(event) => {
                  const nextYear = Number(event.currentTarget.value);
                  setViewMonth(formatDateParts(nextYear, month, 1));
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
              disabled={year === MAX_YEAR && month === 12}
              onClick={() => setViewMonth(addMonths(viewMonth, 1))}
            >
              ›
            </button>
          </div>
          <div className="calendar-weekdays" aria-hidden="true">
            {weekdays.map((weekday) => <span key={weekday} title={weekday}>{weekday[0]}</span>)}
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
                disabled={Boolean(min && date < min) || (ignoreWeekends && isWeekend(date))}
                data-date={date}
                tabIndex={date === tabDate ? 0 : -1}
                onFocus={() => setFocusedDate(date)}
                onKeyDown={(event) => navigateDay(event, date)}
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
          {error && <p className="calendar-date-error" role="alert">{error}</p>}
          {(optional || selectedDates) && <div className="calendar-footer">
            {optional && <button className="calendar-today-button" type="button" onClick={() => {
              onChange("");
              closeCalendar();
              triggerRef.current?.focus();
            }}>Clear date</button>}
            {selectedDates && <div className="calendar-footer-actions">
              {onDatesChange && <button className="calendar-footer-button calendar-clear-button" type="button" onClick={() => {
                dragRef.current = null;
                setDragDates(null);
                setError("");
                onDatesChange([]);
              }}>Clear</button>}
              <button className="calendar-footer-button calendar-done-button" type="button" onClick={() => {
                closeCalendar();
                triggerRef.current?.focus();
              }}>Done</button>
            </div>}
          </div>}
        </div>,
        document.body,
      )}
    </div>
  );
}
