import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { HexColorInput, HexColorPicker } from "react-colorful";
import { CalendarPicker } from "./CalendarPicker";
import { SettingTooltip } from "./SettingTooltip";
import { POOL_COLORS } from "./poolColors";
import { TIMELINE_PRESETS, type TimelinePreset } from "./settings";
import {
  addDays,
  dayPoolHours,
  eventTotalHours,
  formatHours,
  isValidDate,
  MONTH_NAMES,
  MAX_POOL_NAME_LENGTH,
  MAX_EVENT_NAME_LENGTH,
  NTH_WEEKDAYS,
  parseHours,
  eventBalanceWarnings,
  prettyDate,
  sortDays,
  todayDate,
  WEEKDAYS,
  type Cadence,
  type AdditionFormData,
  type PoolFormData,
  type PoolCapFormData,
  type EventDayInput,
  type LeaveDay,
  type LeaveEvent,
  type NthWeekday,
  type Pool,
  type Store,
  type Weekday,
} from "./model";

export type { AdditionFormData, PoolCapFormData, PoolFormData } from "./model";

interface ModalFrameProps {
  icon: string;
  iconClass?: string;
  title: string;
  description: string;
  labelledBy: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}

export function ModalFrame({
  icon,
  iconClass = "",
  title,
  description,
  labelledBy,
  onClose,
  className = "",
  children,
}: ModalFrameProps) {
  const cardRef = useRef<HTMLElement>(null);
  // Capture before React commits any autoFocus controls inside the dialog.
  const openerRef = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const card = cardRef.current;
    const opener = openerRef.current;
    if (!card) return;
    function controls() {
      return Array.from(card!.querySelectorAll<HTMLElement>(
        'button, select, input:not([type="hidden"]), textarea, a[href], [tabindex]',
      )).filter((element) => element.tabIndex >= 0 && !element.matches(":disabled") &&
        !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
        getComputedStyle(element).display !== "none" && getComputedStyle(element).visibility !== "hidden");
    }
    function focusInside() {
      (controls()[0] ?? card)?.focus();
    }
    if (!card.contains(document.activeElement)) focusInside();
    function handleFocus(event: FocusEvent) {
      const popup = (event.target as Element).closest?.('[role="dialog"][id]');
      if (popup && Array.from(card!.querySelectorAll('[aria-controls]')).some((control) => control.getAttribute("aria-controls") === popup.id)) return;
      if (!card!.contains(event.target as Node)) focusInside();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      const popup = (event.target as Element).closest?.('[role="dialog"][id]');
      if (popup && Array.from(card!.querySelectorAll('[aria-controls]')).some((control) => control.getAttribute("aria-controls") === popup.id)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key !== "Tab") return;
      const elements = controls();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !card!.contains(document.activeElement) || document.activeElement === card ||
        (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last ?? card : first ?? card)?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocus);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocus);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <div className="modal-backdrop">
      <section ref={cardRef} tabIndex={-1} className={className ? `modal-card ${className}` : "modal-card"} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <div className="modal-header">
          <div className={`modal-icon ${iconClass}`}>{icon}</div>
          <div className="modal-heading">
            <h2 id={labelledBy}>{title}</h2>
            <p>{description}</p>
          </div>
          <button className="icon-button modal-close" type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function SettingsModal({ firstDayOfWeek, onChange, ignoreWeekends, onIgnoreWeekendsChange, defaultTimeline, onDefaultTimelineChange, onExport, onImport, browserOnly, onLogoutEverywhere, onClose }: {
  firstDayOfWeek: Weekday;
  onChange: (day: Weekday) => void;
  ignoreWeekends: boolean;
  onIgnoreWeekendsChange: (ignore: boolean) => void;
  defaultTimeline: TimelinePreset;
  onDefaultTimelineChange: (preset: TimelinePreset) => void;
  onExport: () => void;
  onImport: (importSettings: boolean) => void;
  onLogoutEverywhere?: () => void;
  browserOnly?: boolean;
  onClose: () => void;
}) {
  const [importSettings, setImportSettings] = useState(false);
  const [showImportOptions, setShowImportOptions] = useState(false);
  const closeImportOptions = () => setShowImportOptions(false);

  if (showImportOptions) return <ModalFrame icon="↥" title="Import backup" description="Choose whether to restore settings, then select your backup file." labelledBy="import-modal-title" onClose={closeImportOptions}>
    <div className="modal-form">
      <fieldset className="pool-visibility-settings">
        <label><input autoFocus type="checkbox" checked={importSettings} onChange={(event) => setImportSettings(event.currentTarget.checked)} aria-describedby="import-settings-description" />Import settings</label>
      </fieldset>
      <p className="wizard-hint" id="import-settings-description">Also restore settings from the imported backup. Leave unchecked to keep this device’s settings.</p>
      <div className="modal-actions">
        <button className="button button-outline" type="button" onClick={closeImportOptions}>Cancel</button>
        <button className="button button-primary" type="button" onClick={() => onImport(importSettings)}>Choose backup file</button>
      </div>
    </div>
  </ModalFrame>;

  return <ModalFrame icon="⚙" title="Settings" description="Make hima feel at home. Changes are saved on this device." labelledBy="settings-modal-title" onClose={onClose}>
    <div className="modal-form">
      <label className="field-label">
        First day of the week
        <select autoFocus value={firstDayOfWeek} onChange={(event) => onChange(event.currentTarget.value as Weekday)} aria-describedby="week-start-description">
          {WEEKDAYS.map((day) => <option key={day} value={day}>{day}</option>)}
        </select>
      </label>
      <p className="wizard-hint" id="week-start-description">Calendar pickers display weeks starting on this day.</p>
      <label className="field-label">
        Default timeline
        <select value={defaultTimeline} onChange={(event) => onDefaultTimelineChange(event.currentTarget.value as TimelinePreset)} aria-describedby="default-timeline-description">
          {TIMELINE_PRESETS.map((preset) => <option key={preset} value={preset}>{preset === "±6 month" ? "±6 months" : preset}</option>)}
        </select>
      </label>
      <p className="wizard-hint" id="default-timeline-description">The graph timeline shown when first loading the page. ±6 months shows six months before and after today.</p>
      <fieldset className="pool-visibility-settings">
        <label><input type="checkbox" checked={ignoreWeekends} onChange={(event) => onIgnoreWeekendsChange(event.currentTarget.checked)} aria-describedby="ignore-weekends-description" />Ignore weekends</label>
      </fieldset>
      <p className="wizard-hint" id="ignore-weekends-description">Skip Saturdays and Sundays in the graph and calendar selections. Existing entries and balance calculations are preserved.</p>
      <div className="field-label">Data backup</div>
      <p className="wizard-hint">Export your data as a JSON backup or import a saved backup.</p>
      <div className="modal-actions">
        <button className="button button-outline" type="button" onClick={onExport}>Export JSON</button>
        {browserOnly && <p>Data is stored only in this browser and is lost if site data is cleared. Export backups regularly.</p>}
        <button className="button button-outline" type="button" onClick={() => {
          setImportSettings(false);
          setShowImportOptions(true);
        }}>Import JSON</button>
      </div>
      {onLogoutEverywhere && <>
        <div className="field-label">Account sessions</div>
        <p className="wizard-hint">End all hima sessions, including this browser and other devices. Your provider’s SSO session stays signed in.</p>
        <button className="button button-outline" type="button" onClick={onLogoutEverywhere}>Sign out everywhere</button>
      </>}
      <div className="modal-actions">
        <button className="button button-primary" type="button" onClick={onClose}>Done</button>
      </div>
    </div>
  </ModalFrame>;
}

function DeleteButton({ label, onDelete }: { label: string; onDelete: () => void }) {
  return <button className="icon-button modal-delete" type="button" title={label} aria-label={label} onClick={onDelete}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
    </svg>
  </button>;
}

interface PoolModalProps {
  onDelete?: () => void;
  initialColor?: string;
  editing: boolean;
  initialName?: string;
  initialDate?: string;
  initialHiddenFromGraph?: boolean;
  initialHiddenFromTotal?: boolean;
  initialNewAdditionsExpireSameDay?: boolean;
  onClose: () => void;
  onSave: (form: PoolFormData) => string | null;
}

export function PoolModal({
  onDelete,
  initialColor = "#60866b",
  editing,
  initialName = "",
  initialDate = todayDate(),
  initialHiddenFromGraph = false,
  initialHiddenFromTotal = false,
  initialNewAdditionsExpireSameDay = false,
  onClose,
  onSave,
}: PoolModalProps) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [customColor, setCustomColor] = useState(!POOL_COLORS.includes(initialColor.toLowerCase()));
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [hiddenFromTotal, setHiddenFromTotal] = useState(initialHiddenFromTotal);
  const [newAdditionsExpireSameDay, setNewAdditionsExpireSameDay] = useState(initialNewAdditionsExpireSameDay);
  const [openingAmount, setOpeningAmount] = useState("");
  const [openingDate, setOpeningDate] = useState(initialDate);
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Add a name for this pool.");
      return;
    }
    if (!editing && openingAmount.trim() !== "" && parseHours(openingAmount, true) === null) {
      setError("Enter a starting balance with up to two decimal places.");
      return;
    }
    if (!editing && !isValidDate(openingDate)) {
      setError("Choose a valid starting date.");
      return;
    }
    const saveError = onSave({
      name: trimmedName,
      openingAmount,
      openingDate,
      hiddenFromGraph: initialHiddenFromGraph,
      hiddenFromTotal,
      color: editing ? color : undefined,
      newAdditionsExpireSameDay,
    });
    if (saveError) setError(saveError);
  }

  return (
    <ModalFrame
      icon="◌"
      title={editing ? "Edit pool" : "Create a pool"}
      description={
        editing
          ? "Manage this pool's name, color, and visibility. Its balance is calculated from additions and events."
          : "Give a kind of leave its own little home."
      }
      labelledBy="pool-modal-title"
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={submit}>
        <label className="field-label">
          Pool name
          <input
            type="text"
            placeholder="e.g. Personal leave"
            value={name}
            maxLength={MAX_POOL_NAME_LENGTH}
            autoFocus
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </label>
        {editing && (
          <fieldset className="pool-color-settings">
            <legend>Pool color</legend>
            <div className="pool-color-options" role="group" aria-label="Default color palette">
              {POOL_COLORS.map((paletteColor) => (
                <button
                  key={paletteColor}
                  type="button"
                  className="pool-color-swatch"
                  style={{ backgroundColor: paletteColor }}
                  aria-label={`Select color ${paletteColor}`}
                  aria-pressed={!customColor && color.toLowerCase() === paletteColor}
                  title={paletteColor}
                  onClick={() => {
                    setColor(paletteColor);
                    setCustomColor(false);
                    setColorPickerOpen(false);
                  }}
                >
                  {!customColor && color.toLowerCase() === paletteColor ? "✓" : ""}
                </button>
              ))}
              <button
                type="button"
                className="button button-soft button-small"
                aria-pressed={customColor}
                aria-expanded={colorPickerOpen}
                onClick={() => {
                  setCustomColor(true);
                  setColorPickerOpen((open) => !open);
                }}
              >
                Color palette
              </button>
            </div>
            {colorPickerOpen && (
              <div className="pool-custom-color-picker">
                <HexColorPicker color={color} onChange={setColor} />
                <div className="pool-custom-color-value">
                  <span className="pool-custom-color-preview" style={{ backgroundColor: color }} aria-hidden="true" />
                  <label className="field-label">
                    Hex color
                    <HexColorInput color={color} onChange={setColor} prefixed aria-label="Custom hex color" />
                  </label>
                  <button className="button button-soft button-small" type="button" onClick={() => setColorPickerOpen(false)}>Done</button>
                </div>
              </div>
            )}
          </fieldset>
        )}
        {!editing && (
          <div className="form-two-columns">
            <label className="field-label">
              Starting balance
              <div className="input-with-suffix">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={openingAmount}
                  onChange={(event) => setOpeningAmount(event.currentTarget.value)}
                />
                <span>hours</span>
              </div>
            </label>
            <CalendarPicker label="Balance as of" value={openingDate} onChange={setOpeningDate} />
          </div>
        )}
        <fieldset className="pool-visibility-settings">
          <legend>Pool behavior</legend>
          <div className="holiday-mode-setting">
            <label><input type="checkbox" checked={newAdditionsExpireSameDay} onChange={(event) => setNewAdditionsExpireSameDay(event.currentTarget.checked)} />Holiday Mode</label>
            <SettingTooltip id="holiday-mode-tooltip" label="About Holiday Mode">
              New additions are available only on their scheduled date; unused hours expire the next day. Applies to the starting balance and each occurrence of new repeating schedules. Existing additions are unchanged.
            </SettingTooltip>
          </div>
        </fieldset>
        <fieldset className="pool-visibility-settings">
          <legend>Pool visibility</legend>
          <label><input type="checkbox" checked={hiddenFromTotal} onChange={(event) => setHiddenFromTotal(event.currentTarget.checked)} />Hide from overall balance total</label>
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          {editing && onDelete && <DeleteButton label="Delete pool" onDelete={onDelete} />}
          <button className="button button-quiet" type="button" onClick={onClose}>Cancel</button>
          <button className="button button-primary" type="submit">
            {editing ? "Save changes" : "Create pool"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

interface PoolUsageModalProps {
  pool: Pick<Pool, "id" | "name">;
  events: LeaveEvent[];
  onClose: () => void;
}

export function PoolUsageModal({ pool, events, onClose }: PoolUsageModalProps) {
  const usageByEventDay = new Map<string, { eventId: number; eventName: string; date: string; hours: number }>();
  for (const event of events) {
    for (const day of event.days) {
      const hours = dayPoolHours(day, pool.id);
      if (hours === 0) continue;
      const key = `${event.id}:${day.date}`;
      const existing = usageByEventDay.get(key);
      if (existing) {
        existing.hours += hours;
      } else {
        usageByEventDay.set(key, { eventId: event.id, eventName: event.name, date: day.date, hours });
      }
    }
  }
  const usageEntries = [...usageByEventDay.values()].sort(
    (left, right) => left.date.localeCompare(right.date) || left.eventName.localeCompare(right.eventName),
  );
  const totalUsageHours = usageEntries.reduce((total, entry) => total + entry.hours, 0);

  return (
    <ModalFrame
      icon="▤"
      iconClass="modal-icon-ledger"
      title={`${pool.name} usage`}
      description="Dates, events, and hours allocated from this pool."
      labelledBy={`pool-usage-modal-title-${pool.id}`}
      onClose={onClose}
      className="pool-usage-modal"
    >
      {usageEntries.length === 0 ? (
        <p className="pool-usage-modal-empty">No event days are allocated to this pool yet.</p>
      ) : (
        <div className="pool-usage-modal-table-scroll">
          <table className="pool-usage-table">
            <thead>
              <tr><th scope="col">Date</th><th scope="col">Event</th><th scope="col">Hours</th></tr>
            </thead>
            <tbody>
              {usageEntries.map((entry) => (
                <tr key={`${entry.eventId}-${entry.date}`}>
                  <td><time dateTime={entry.date}>{prettyDate(entry.date)}</time></td>
                  <td title={entry.eventName}>{entry.eventName}</td>
                  <td>{formatHours(entry.hours)} h</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th scope="row" colSpan={2}>Total allocated</th><td>{formatHours(totalUsageHours)} h</td></tr>
            </tfoot>
          </table>
        </div>
      )}
      <div className="modal-actions">
        <button className="button button-quiet" type="button" onClick={onClose}>Done</button>
      </div>
    </ModalFrame>
  );
}

interface CapDraft {
  amount: string;
  date: string;
  endDate: string;
}

export function PoolCapModal({ poolName, editing, initialAmount = "", initialDate = "", initialEndDate = "", draft, onDraftChange, actions, onClose, onSave, onDelete }: {
  poolName: string;
  editing: boolean;
  initialAmount?: string;
  initialDate?: string;
  initialEndDate?: string;
  draft?: CapDraft;
  onDraftChange?: (draft: CapDraft) => void;
  actions?: ReactNode;
  onClose: () => void;
  onSave: (cap: PoolCapFormData) => string | null;
  onDelete?: () => void;
}) {
  const [localDraft, setLocalDraft] = useState({ amount: initialAmount, date: initialDate, endDate: initialEndDate });
  const { amount, date, endDate } = draft ?? localDraft;
  const [error, setError] = useState("");
  function update(change: Partial<CapDraft>) {
    (onDraftChange ?? setLocalDraft)({ amount, date, endDate, ...change });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const maxBalance = parseHours(amount, true);
    if (amount.trim() === "" || maxBalance === null) {
      setError("Enter a maximum balance of zero or more with up to two decimal places.");
      return;
    }
    if (!isValidDate(date) || (endDate && !isValidDate(endDate))) {
      setError("Choose a valid start date and, if provided, end date.");
      return;
    }
    if (endDate && endDate < date) {
      setError("A cap's end date must be on or after its start date.");
      return;
    }
    const saveError = onSave({ max_balance: maxBalance, start_date: date, ...(endDate ? { end_date: endDate } : {}) });
    if (saveError) setError(saveError);
  }
  return <ModalFrame icon="+" iconClass="modal-icon-add"
    title={`${editing ? "Edit balance cap in" : "Add balance cap to"} ${poolName}`}
    description="Limit the balance from accrual. Leave the end date blank for an ongoing cap; leave usage can make room again."
    labelledBy="cap-modal-title" onClose={onClose}>
    <form className="modal-form" onSubmit={submit}>
      {actions}
      <label className="field-label">Maximum balance
        <div className="input-with-suffix">
          <input type="number" min="0" step="0.01" placeholder="e.g. 7.6" value={amount} onChange={(event) => update({ amount: event.currentTarget.value })} />
          <span>hours</span>
        </div>
      </label>
      <CalendarPicker label="Starts on" value={date} onChange={(date) => update({ date })} />
      <CalendarPicker label="End date (inclusive, optional)" optional min={date} value={endDate} onChange={(endDate) => update({ endDate })} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions">
        {editing && onDelete && <DeleteButton label="Delete balance cap" onDelete={onDelete} />}
        <button className="button button-quiet" type="button" onClick={onClose}>Cancel</button>
        <button className="button button-primary" type="submit">Save balance cap</button>
      </div>
    </form>
  </ModalFrame>;
}

interface AdditionModalProps {
  onDelete?: () => void;
  onSaveCap?: (cap: PoolCapFormData) => string | null;
  initialReset?: boolean;
  initialExpiresSameDay?: boolean;
  poolName: string;
  mode: "add" | "edit-one-time" | "edit-recurring";
  initialAmount?: string;
  initialDate?: string;
  initialEndDate?: string;
  initialCadence?: Cadence;
  initialMonth?: number;
  initialNthWeekday?: NthWeekday;
  initialWeekday?: Weekday;
  onClose: () => void;
  onSave: (addition: AdditionFormData) => string | null;
}

export function AdditionModal({
  onDelete,
  onSaveCap,
  initialReset = false,
  initialExpiresSameDay = false,
  poolName,
  mode,
  initialAmount = "",
  initialDate = "",
  initialEndDate = "",
  initialCadence = "Fortnightly",
  initialMonth = Number(todayDate().slice(5, 7)),
  initialNthWeekday = "First",
  initialWeekday = "Friday",
  onClose,
  onSave,
}: AdditionModalProps) {
  const adding = mode === "add";
  const [action, setAction] = useState<"add" | "reset" | "cap">(initialReset ? "reset" : "add");
  const reset = action === "reset";
  const [amount, setAmount] = useState(initialAmount);
  const [date, setDate] = useState(initialDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [recurring, setRecurring] = useState(mode === "edit-recurring");
  const [cadence, setCadence] = useState<Cadence>(initialCadence);
  const [month, setMonth] = useState(initialMonth);
  const [nthWeekday, setNthWeekday] = useState<NthWeekday>(initialNthWeekday);
  const [weekday, setWeekday] = useState<Weekday>(initialWeekday);
  const [error, setError] = useState("");
  const [selectedDates, setSelectedDates] = useState<string[]>(initialDate ? [initialDate] : []);
  const batchAdding = adding && !reset && !recurring;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = reset && amount.trim() === "" ? 0 : parseHours(amount, reset);
    if (parsedAmount === null) {
      setError(reset
        ? "Enter a reset balance of zero or more with up to two decimal places."
        : "Enter an amount greater than zero with up to two decimal places.");
      return;
    }
    if (!batchAdding && !isValidDate(date)) {
      setError("Choose a valid date.");
      return;
    }
    if (
      recurring &&
      cadence === "YearlyNthWeekday" &&
      (!Number.isInteger(month) || month < 1 || month > 12 || !nthWeekday || !weekday)
    ) {
      setError("Choose a valid occurrence, weekday, and month.");
      return;
    }
    if (recurring && endDate && !isValidDate(endDate)) {
      setError("Choose a valid end date.");
      return;
    }
    if (recurring && endDate && endDate < date) {
      setError("The end date must be on or after the schedule's start date.");
      return;
    }
    const parsedEntries: { amount: number; date: string }[] = [];
    const firstSelectedDate = selectedDates[0];
    if (batchAdding) {
      if (firstSelectedDate === undefined || selectedDates.some((selected) => !isValidDate(selected))) {
        setError("Choose at least one valid date.");
        return;
      }
      parsedEntries.push(...selectedDates.slice(1).map((selected) => ({ amount: parsedAmount, date: selected })));
    }
    const saveError = onSave({
      ...(parsedEntries.length ? { additionalEntries: parsedEntries } : {}),
      reset,
      expiresSameDay: !reset && initialExpiresSameDay,
      amount: parsedAmount,
      date: batchAdding ? firstSelectedDate ?? date : date,
      recurring,
      cadence,
      ...(recurring && endDate ? { endDate } : {}),
      ...(recurring && cadence === "YearlyNthWeekday" ? { month, nthWeekday, weekday } : {}),
    });
    if (saveError) setError(saveError);
  }

  const actionControls = adding && <div className="segmented-control" role="group" aria-label="Action">
    {[
      { value: "add" as const, label: "Add time" },
      { value: "reset" as const, label: "Reset balance" },
      ...(onSaveCap ? [{ value: "cap" as const, label: "Balance cap" }] : []),
    ].map((option) => {
      const selected = option.value === action;
      return <button key={option.value} className={selected ? "segment is-active" : "segment"}
        type="button" aria-pressed={selected} onClick={() => {
          setAction(option.value);
          setError("");
        }}>{option.label}</button>;
    })}
  </div>;

  if (action === "cap" && onSaveCap) return <PoolCapModal poolName={poolName} editing={false}
    draft={{ amount, date, endDate }} onDraftChange={(draft) => {
      setAmount(draft.amount);
      setDate(draft.date);
      setEndDate(draft.endDate);
    }} actions={actionControls} onClose={onClose} onSave={onSaveCap} />;

  const title = adding
    ? `Add ${reset ? "use-by date" : "time"} to ${poolName}`
    : `Edit ${reset ? "balance reset" : "addition"} in ${poolName}`;

  return (
    <ModalFrame
      icon="+"
      iconClass="modal-icon-add"
      title={title}
      description={
        reset
          ? "Set the balance to your chosen amount at the end of each reset date, after additions and leave usage."
          : adding
          ? "Choose dates to add the entered amount on each date, or set a repeating schedule."
          : "Update this addition's amount, date, or schedule."
      }
      labelledBy="addition-modal-title"
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={submit}>
        {actionControls}
        {adding && (
          <div className="segmented-control">
            <button
              className={!recurring ? "segment is-active" : "segment"}
              type="button"
              onClick={() => {
                if (recurring && !reset) setSelectedDates(date ? [date] : []);
                setRecurring(false);
              }}
            >
              One-time
            </button>
            <button
              className={recurring ? "segment is-active" : "segment"}
              type="button"
              onClick={() => {
                if (batchAdding) setDate(selectedDates[0] ?? "");
                setRecurring(true);
              }}
            >
              Repeating
            </button>
          </div>
        )}
        <label className="field-label">
          {reset ? "Reset balance to" : "Time to add"}
          <div className="input-with-suffix">
            <input
              type="number"
              min={reset ? "0" : "0.01"}
              step="0.01"
              placeholder={reset ? "0" : "e.g. 7.6"}
              value={amount}
              onChange={(event) => setAmount(event.currentTarget.value)}
            />
            <span>hours</span>
          </div>
        </label>
        {recurring && (
          <label className="field-label">
            Repeat every
            <select value={cadence} onChange={(event) => setCadence(event.currentTarget.value as Cadence)}>
              <option value="Weekly">Week</option>
              <option value="Fortnightly">Fortnight</option>
              <option value="Monthly">Month</option>
              <option value="Yearly">Year</option>
              <option value="YearlyNthWeekday">Nth weekday each year</option>
            </select>
          </label>
        )}
        {recurring && cadence === "YearlyNthWeekday" && (
          <div className="nth-weekday-fields">
            <label className="field-label">
              Occurrence
              <select value={nthWeekday} onChange={(event) => setNthWeekday(event.currentTarget.value as NthWeekday)}>
                {NTH_WEEKDAYS.map((occurrence) => <option key={occurrence} value={occurrence}>{occurrence}</option>)}
              </select>
            </label>
            <label className="field-label">
              Weekday
              <select value={weekday} onChange={(event) => setWeekday(event.currentTarget.value as Weekday)}>
                {WEEKDAYS.map((day) => <option key={day} value={day}>{day}</option>)}
              </select>
            </label>
            <label className="field-label nth-weekday-month">
              Month
              <select value={month} onChange={(event) => setMonth(Number(event.currentTarget.value))}>
                {MONTH_NAMES.map((monthName, index) => (
                  <option key={monthName} value={index + 1}>{monthName}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        <CalendarPicker label={recurring
             ? cadence === "YearlyNthWeekday" ? "Start schedule on" : reset ? "First reset on" : "First addition on"
               : reset ? "Reset on" : "Add on"} value={batchAdding ? "" : date} onChange={setDate}
          selectedDates={batchAdding ? selectedDates : undefined}
          onDatesChange={batchAdding ? setSelectedDates : undefined} />
        {recurring && (
            <CalendarPicker label="End date (inclusive, optional)" optional
              min={date}
              value={endDate}
              onChange={setEndDate}
            />
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          {!adding && onDelete && <DeleteButton label={reset ? "Delete balance reset" : recurring ? "Delete recurring addition" : "Delete one-time addition"} onDelete={onDelete} />}
          <button className="button button-quiet" type="button" onClick={onClose}>Cancel</button>
          <button className="button button-primary" type="submit">
            {reset ? "Save balance reset" : batchAdding && selectedDates.length > 1 ? "Save additions" : "Save addition"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

type EditorAllocation = EventDayInput["allocations"][number] & { clientId: string };
type EditorDay = Omit<EventDayInput, "allocations"> & { clientId: string; allocations: EditorAllocation[] };

function editorAllocation(allocation: EventDayInput["allocations"][number]): EditorAllocation {
  return { ...allocation, clientId: crypto.randomUUID() };
}

function editorDay(day: EventDayInput): EditorDay {
  return { ...day, clientId: crypto.randomUUID(), allocations: day.allocations.map(editorAllocation) };
}

interface EventModalProps {
  eventId?: number;
  onDelete?: () => void;
  pools: Pool[];
  store: Store;
  editing: boolean;
  initialName?: string;
  initialDays?: EventDayInput[];
  onClose: () => void;
  onSave: (name: string, days: LeaveDay[]) => string | null;
}

export function EventModal({
  eventId,
  onDelete,
  pools,
  store,
  editing,
  initialName = "",
  initialDays,
  onClose,
  onSave,
}: EventModalProps) {
  const [defaultPoolId, setDefaultPoolId] = useState(pools[0]?.id ?? 0);
  const [defaultHours, setDefaultHours] = useState("");
  const [name, setName] = useState(initialName);
  const [days, setDays] = useState<EditorDay[]>(() => (initialDays ?? []).map(editorDay));
  const [error, setError] = useState("");

  const [step, setStep] = useState(1);
  const [reviewDays, setReviewDays] = useState<LeaveDay[]>([]);

  function selectDates(dates: string[]) {
    setDays((current) => dates.map((date) => current.find((day) => day.date === date) ?? editorDay({
      date, allocations: [{ pool_id: defaultPoolId, hours: defaultHours }],
    })));
    setError("");
  }

  function changeDefaultHours(hours: string) {
    setDays((current) => current.map((day) => {
      const allocation = day.allocations[0];
      return day.allocations.length === 1 && allocation?.hours === defaultHours
        ? { ...day, allocations: [{ ...allocation, hours }] }
        : day;
    }));
    setDefaultHours(hours);
    setError("");
  }

  function changeDefaultPool(poolId: number) {
    setDays((current) => current.map((day) => {
      const allocation = day.allocations[0];
      return day.allocations.length === 1 && allocation?.pool_id === defaultPoolId
        ? { ...day, allocations: [{ ...allocation, pool_id: poolId }] }
        : day;
    }));
    setDefaultPoolId(poolId);
    setError("");
  }

  function updateDay(dayIndex: number, update: (day: EditorDay) => EditorDay) {
    setDays((current) => current.map((day, index) => index === dayIndex ? update(day) : day));
  }

  function updateAllocation(
    dayIndex: number,
    allocationIndex: number,
    update: (allocation: EditorAllocation) => EditorAllocation,
  ) {
    updateDay(dayIndex, (day) => ({
      ...day,
      allocations: day.allocations.map((allocation, index) =>
        index === allocationIndex ? update(allocation) : allocation,
      ),
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Give this event a name.");
      return;
    }
    if (days.length === 0) {
      setError("Add at least one day to this event.");
      return;
    }
    if (!editing && step === 1) {
      setError("");
      setStep(2);
      return;
    }

    const uniqueDates = new Set<string>();
    const savedDays: LeaveDay[] = [];
    for (const day of days) {
      if (!isValidDate(day.date)) {
        setError("Choose a valid date for each event day.");
        return;
      }
      if (uniqueDates.has(day.date)) {
        setError("Each event day must have a different date.");
        return;
      }
      uniqueDates.add(day.date);
      if (day.allocations.length === 0) {
        setError("Choose at least one pool for each event day.");
        return;
      }
      const uniquePools = new Set<number>();
      const allocations = [];
      for (const allocation of day.allocations) {
        if (uniquePools.has(allocation.pool_id)) {
          setError("Choose each pool only once per day.");
          return;
        }
        uniquePools.add(allocation.pool_id);
        if (!pools.some((pool) => pool.id === allocation.pool_id)) {
          setError("Choose an existing pool for each event day.");
          return;
        }
        const hours = parseHours(allocation.hours);
        if (hours === null) {
          setError("Enter positive hours with up to two decimal places for each pool allocation.");
          return;
        }
        allocations.push({ pool_id: allocation.pool_id, hours });
      }
      savedDays.push({ date: day.date, allocations });
    }

    if ((editing && step === 1) || (!editing && step === 2)) {
      setReviewDays(sortDays(savedDays));
      setError("");
      setStep(3);
      return;
    }
    const saveError = onSave(trimmedName, sortDays(savedDays));
    if (saveError) setError(saveError);
  }

  function addDay() {
    const lastDay = days.at(-1);
    const date = lastDay && isValidDate(lastDay.date) ? addDays(lastDay.date, 1) : "";
    const poolId = lastDay?.allocations[0]?.pool_id ?? defaultPoolId;
    setDays((current) => [
      ...current,
      editorDay({ date, allocations: [{ pool_id: poolId, hours: "" }] }),
    ]);
  }

  const warnings = step === 3 ? eventBalanceWarnings(store, reviewDays, editing ? eventId : undefined).map((warning) =>
    `${pools.find((pool) => pool.id === warning.poolId)?.name} is projected to have ${formatHours(warning.balance)} h on ${prettyDate(warning.date)}, including this event and other planned leave.`,
  ) : [];

  return (
    <ModalFrame
      icon="↘"
      iconClass="modal-icon-event"
      title={editing ? "Edit planned leave" : "Plan some leave"}
      description={
        editing
          ? step === 3 ? "Review your changes and their projected impact before saving." : "Update dates, hours, or the source pool for any day."
          : step === 1 ? "Name your event and choose its dates."
          : step === 2 ? "Choose the hours and source pools for each date."
          : "Review your event and its projected impact before adding it."
      }
      labelledBy="event-modal-title"
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={submit}>
        {!editing && <ol className="event-wizard-steps" aria-label="Event creation progress">
          {["Name & dates", "Hours & pools", "Overview"].map((title, index) => <li key={title} aria-current={step === index + 1 ? "step" : undefined} className={step === index + 1 ? "is-active" : ""}>{index + 1}. {title}</li>)}
        </ol>}
        {step === 1 && <>
        <label className="field-label">
          Event name
          <input
            type="text"
            placeholder="e.g. A long weekend"
            value={name}
            maxLength={MAX_EVENT_NAME_LENGTH}
            autoFocus
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </label>
        {!editing && <>
          <CalendarPicker label="Event dates" value="" onChange={() => {}} selectedDates={days.map((day) => day.date)} onDatesChange={selectDates} />
          <p className="wizard-hint">Click dates or drag to select a range. Start on a selected date to deselect a range. You can choose dates across multiple months.</p>
          <ul className="event-selected-dates">{days.map((day) => <li key={day.date}><time dateTime={day.date}>{prettyDate(day.date)}</time><button type="button" className="icon-button" aria-label={`Remove ${prettyDate(day.date)}`} onClick={() => selectDates(days.filter((item) => item.date !== day.date).map((item) => item.date))}>×</button></li>)}</ul>
        </>}
        </>}
        {!editing && step <= 2 && <>
          <div className="form-two-columns">
            <label className="field-label">
              Default hours
              <div className="input-with-suffix">
                <input type="number" min="0.01" step="0.01" placeholder="e.g. 7.6" value={defaultHours} onChange={(event) => changeDefaultHours(event.currentTarget.value)} />
                <span>hours</span>
              </div>
            </label>
            <label className="field-label">
              Default pool
              <select value={defaultPoolId} onChange={(event) => changeDefaultPool(Number(event.currentTarget.value))}>
                {pools.map((pool) => <option key={pool.id} value={pool.id}>{pool.name}</option>)}
              </select>
            </label>
          </div>
          <p className="wizard-hint">Defaults apply to each selected date. You can adjust individual days in Hours &amp; pools; split allocations keep their own values.</p>
        </>}
        {((editing && step === 1) || step === 2) && <>
        <div className="event-days-editor">
          <div className="event-days-heading">
            <span>Days covered</span>
            <span>Hours are recorded per day</span>
          </div>
          {days.map((day, dayIndex) => {
            const availablePool = pools.find(
              (pool) => !day.allocations.some((allocation) => allocation.pool_id === pool.id),
            );
            const canAddPool = day.allocations.length < pools.length;
            return (
              <div className="event-day-card" key={day.clientId}>
                <div className="event-day-header">
                  {editing ? (
                    <CalendarPicker label="Date"
                      value={day.date}
                      onChange={(date) => {
                        updateDay(dayIndex, (current) => ({ ...current, date }));
                      }}
                    />
                  ) : <strong>{prettyDate(day.date)}</strong>}
                  {editing && days.length > 1 && (
                    <button
                      className="icon-button event-day-remove"
                      type="button"
                      title="Remove day"
                      aria-label="Remove event day"
                      onClick={() => setDays((current) => current.filter((_, index) => index !== dayIndex))}
                    >
                      ×
                    </button>
                  )}
                </div>
                <div className="event-allocations">
                  {day.allocations.map((allocation, allocationIndex) => (
                    <div className="event-allocation-row" key={allocation.clientId}>
                      <label className="field-label">
                        Pool
                        <select
                          value={allocation.pool_id}
                          onChange={(event) => {
                            const poolId = Number(event.currentTarget.value);
                            updateAllocation(dayIndex, allocationIndex, (current) => ({ ...current, pool_id: poolId }));
                          }}
                        >
                          {pools.map((pool) => <option key={pool.id} value={pool.id}>{pool.name}</option>)}
                        </select>
                      </label>
                      <label className="field-label">
                        Hours
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="e.g. 3.5"
                          value={allocation.hours}
                          onChange={(event) => {
                            const hours = event.currentTarget.value;
                            updateAllocation(dayIndex, allocationIndex, (current) => ({ ...current, hours }));
                          }}
                        />
                      </label>
                      {day.allocations.length > 1 && (
                        <button
                          className="icon-button allocation-remove"
                          type="button"
                          title="Remove pool allocation"
                          aria-label="Remove pool allocation"
                          onClick={() => updateDay(dayIndex, (current) => ({
                            ...current,
                            allocations: current.allocations.filter((_, index) => index !== allocationIndex),
                          }))}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {canAddPool && availablePool && (
                    <button
                      className="button button-soft button-small add-day-button"
                      type="button"
                      onClick={() => updateDay(dayIndex, (current) => ({
                        ...current,
                        allocations: [...current.allocations, editorAllocation({ pool_id: availablePool.id, hours: "" })],
                      }))}
                    >
                      <span className="button-plus">+</span>
                      Split this day across another pool
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {editing && <button className="button button-soft button-small add-day-button" type="button" onClick={addDay}>
            <span className="button-plus">+</span>
            Add another day
          </button>}
        </div>
        </>}
        {step === 3 && <section className="event-review" aria-label="Event overview">
          <h3>{name.trim()}</h3>
          <p>{reviewDays.length} {reviewDays.length === 1 ? "day" : "days"} · {formatHours(eventTotalHours({ days: reviewDays }))} hours total</p>
          {reviewDays.map((day) => <div className="event-day-card" key={day.date}>
            <strong>{prettyDate(day.date)}</strong>
            {day.allocations.map((allocation) => <div className="event-review-allocation" key={allocation.pool_id}><span>{pools.find((pool) => pool.id === allocation.pool_id)?.name}</span><strong>{formatHours(allocation.hours)} h</strong></div>)}
          </div>)}
          <div className={warnings.length ? "event-review-warnings" : "event-review-clear"}>
            <strong>{warnings.length ? "Balance warnings" : "No negative pool balances projected"}</strong>
            {warnings.length > 0 && <><ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul><p>You can still {editing ? "save these changes" : "add this event"}, or go back to adjust the allocations.</p></>}
          </div>
        </section>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          {editing && onDelete && <DeleteButton label="Delete event" onDelete={onDelete} />}
          <button className="button button-quiet" type="button" onClick={onClose}>Cancel</button>
          {step > 1 && <button className="button button-quiet" type="button" onClick={() => { setStep(editing ? 1 : step - 1); setError(""); }}>Back</button>}
          <button className="button button-primary" type="submit">
            {editing ? step === 3 ? "Save changes" : "Review changes" : step === 1 ? "Next: hours & pools" : step === 2 ? "Review event" : "Add to plan"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

export function eventInputDays(days: LeaveDay[]): EventDayInput[] {
  return days.map((day) => ({
    date: day.date,
    allocations: day.allocations.map((allocation) => ({
      pool_id: allocation.pool_id,
      hours: String(allocation.hours),
    })),
  }));
}
