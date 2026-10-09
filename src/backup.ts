import { parseStoreJson, WEEKDAYS, type Store, type Weekday } from "./model";
import { TIMELINE_PRESETS, type TimelinePreset } from "./settings";

export type BackupSettings = {
  firstDayOfWeek: Weekday;
  ignoreWeekends: boolean;
  defaultTimeline: TimelinePreset;
};

export function serializeBackupJson(store: Store, settings: BackupSettings): string {
  return JSON.stringify({ ...store, settings }, null, 2);
}

export function parseBackupJson(json: string): { store: Store; settings?: BackupSettings } {
  const store = parseStoreJson(json);
  const source = JSON.parse(json) as Record<string, unknown>;
  if (!("settings" in source)) return { store };

  const value = source.settings;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The backup contains invalid settings.");
  }
  const settings = value as Record<string, unknown>;
  const firstDayOfWeek = WEEKDAYS.find((day) => day === settings.firstDayOfWeek);
  const defaultTimeline = TIMELINE_PRESETS.find((preset) => preset === settings.defaultTimeline);
  if (!firstDayOfWeek || !defaultTimeline || typeof settings.ignoreWeekends !== "boolean") {
    throw new Error("The backup contains invalid settings.");
  }
  return { store, settings: { firstDayOfWeek, ignoreWeekends: settings.ignoreWeekends, defaultTimeline } };
}
