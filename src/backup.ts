import { parseStoreJson, type Store } from "./model";
import { isValidSettings, type BackupSettings } from "./settings";

export function serializeBackupJson(store: Store, settings: BackupSettings): string {
  return JSON.stringify({ ...store, settings }, null, 2);
}

export function parseBackupJson(json: string, warnings: string[] = []): { store: Store; settings?: BackupSettings } {
  const store = parseStoreJson(json, warnings);
  const source = JSON.parse(json) as Record<string, unknown>;
  if (!("settings" in source)) return { store };

  const value = source.settings;
  if (!isValidSettings(value)) {
    throw new Error("The backup contains invalid settings.");
  }
  const { firstDayOfWeek, ignoreWeekends, defaultTimeline } = value;
  return { store, settings: { firstDayOfWeek, ignoreWeekends, defaultTimeline } };
}
