import { parseBackupJson } from "./backup";
import { emptyStore, STORAGE_KEY } from "./model";
import { defaultSettings, validateDocument, type PlannerDocument } from "./plannerPersistence";

export type LocalMigration = { document: PlannerDocument | null; warnings: string[]; error: string | null; raw: string; fingerprint: string };
export interface LocalSource {
  read(userId: number): LocalMigration | null;
  confirm(userId: number, fingerprint: string): void;
}
export const browserLocalSource: LocalSource = {
  read(userId) {
    try {
      const store = localStorage.getItem(STORAGE_KEY);
      const settings = localStorage.getItem("hima.settings.v1");
      if (store === null && settings === null) return null;
      const raw = JSON.stringify({ [STORAGE_KEY]: store, "hima.settings.v1": settings }, null, 2);
      const fingerprint = raw;
      if (localStorage.getItem(`hima.migration.v1.${userId}`) === fingerprint) return null;
      const warnings: string[] = [];
      try {
        const parsed = store === null ? { store: emptyStore() } : parseBackupJson(store, warnings);
        const preferences = settings === null ? {} : JSON.parse(settings);
        const document = { ...parsed.store, settings: parsed.settings ?? { ...defaultSettings, ...preferences } };
        validateDocument(document);
        return { document, warnings, error: null, raw, fingerprint };
      } catch (error) {
        return { document: null, warnings, error: error instanceof Error ? error.message : "Invalid local data", raw, fingerprint };
      }
    } catch { return null; }
  },
  confirm(userId, fingerprint) {
    // Originals remain byte-for-byte intact, even after acknowledgement.
    try { localStorage.setItem(`hima.migration.v1.${userId}`, fingerprint); } catch { /* Offer again next login if storage is unavailable. */ }
  },
};
