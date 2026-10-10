import { parseBackupJson } from "./backup";
import { ACK_PREFIX, SETTINGS_KEY, STORAGE_KEY, serializeRawBrowserData } from "./browserStorage";
import { exportRawBrowserData } from "./localPersistence";
import { emptyStore } from "./model";
import { validateDocument, type PlannerDocument } from "./plannerPersistence";
import { defaultSettings } from "./settings";

export type LocalMigration = { document: PlannerDocument | null; warnings: string[]; error: string | null; raw: string; fingerprint: string };
export interface LocalSource {
  read(userId: number): LocalMigration | null | Promise<LocalMigration | null>;
  confirm(userId: number, fingerprint: string): void;
  remove?(raw: string): void;
}
const digest = async (raw: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw))), (byte) => byte.toString(16).padStart(2, "0")).join("");
export const browserLocalSource: LocalSource = {
  async read(userId) {
    try {
      // Upgrade old acknowledgements even if their original sources are gone.
      const keys = Object.keys(localStorage).filter((key) => key.startsWith(ACK_PREFIX));
      for (const key of keys) {
        const value = localStorage.getItem(key);
        if (value && !/^[a-f0-9]{64}$/.test(value)) {
          const fingerprint = await digest(value);
          if (localStorage.getItem(key) === value) localStorage.setItem(key, fingerprint);
        }
      }
      const store = localStorage.getItem(STORAGE_KEY);
      const settings = localStorage.getItem(SETTINGS_KEY);
      if (store === null && settings === null) return null;
      const raw = serializeRawBrowserData(store, settings);
      const fingerprint = await digest(raw);
      if (localStorage.getItem(`${ACK_PREFIX}${userId}`) === fingerprint) return null;
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
    try { localStorage.setItem(`${ACK_PREFIX}${userId}`, fingerprint); } catch { /* Offer again next login if storage is unavailable. */ }
  },
  remove(raw) {
    if (exportRawBrowserData() !== raw) throw new Error("Browser data changed since migration. The newer local copy was kept.");
    const keys = Object.keys(localStorage).filter((key) =>
      key === STORAGE_KEY || key === SETTINGS_KEY || key.startsWith(ACK_PREFIX) ||
      [STORAGE_KEY, SETTINGS_KEY].some((source) => key === `${source}.backup` || key.startsWith(`${source}.backup.`)));
    for (const key of keys) localStorage.removeItem(key);
  },
};
