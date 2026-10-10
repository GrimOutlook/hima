import { serializeBackupJson } from "./backup";
import { todayDate } from "./model";
import type { PlannerDocument } from "./plannerPersistence";
import { defaultSettings } from "./settings";

export function downloadBackup(document: PlannerDocument) {
  downloadJson(serializeBackupJson(document, document.settings ?? defaultSettings));
}

export function downloadJson(json: string) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = `hima-backup-${todayDate()}.json`;
  window.document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
