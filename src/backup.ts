import type { Store } from "./model";
import { parseStoreValue } from "./normalize";
import { isValidSettings, type BackupSettings } from "./settings";

export function serializeBackupJson(store: Store, settings: BackupSettings): string {
  return JSON.stringify({ ...store, settings }, null, 2);
}

export function parseBackupJson(json: string, warnings: string[] = []): { store: Store; settings?: BackupSettings } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }
  const store = parseStoreValue(parsed, warnings);
  const source = parsed as Record<string, unknown>;
  if (!("settings" in source)) return { store };

  const value = source.settings;
  if (!isValidSettings(value)) {
    throw new Error("The backup contains invalid settings.");
  }
  const { firstDayOfWeek, ignoreWeekends, defaultTimeline } = value;
  return { store, settings: { firstDayOfWeek, ignoreWeekends, defaultTimeline } };
}
