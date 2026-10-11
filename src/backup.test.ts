import { describe, expect, it } from "vitest";
import { parseBackupJson, serializeBackupJson } from "./backup";
import type { BackupSettings } from "./settings";
import { emptyStore } from "./model";

describe("backups", () => {
  const settings: BackupSettings = {
    firstDayOfWeek: "Sunday",
    ignoreWeekends: true,
    defaultTimeline: "future 1 year",
  };

  it("round-trips data and settings", () => {
    const store = emptyStore();
    expect(parseBackupJson(serializeBackupJson(store, settings))).toEqual({ store, settings });
  });

  it("imports legacy backups without supplying replacement settings", () => {
    const store = emptyStore();
    expect(parseBackupJson(JSON.stringify(store))).toEqual({ store });
  });

  it.each([
    null,
    [],
    { ...settings, firstDayOfWeek: "invalid" },
    { ...settings, ignoreWeekends: "true" },
    { ...settings, defaultTimeline: "invalid" },
  ])("rejects invalid settings: %j", (invalid) => {
    expect(() => parseBackupJson(JSON.stringify({ ...emptyStore(), settings: invalid })))
      .toThrow("invalid settings");
  });
});
