import { REVISION_KEY, SETTINGS_KEY, STORAGE_KEY, serializeRawBrowserData } from "./browserStorage";
import { PersistenceError, validateDocument, type PlannerPersistence } from "./plannerPersistence";

export { REVISION_KEY, SETTINGS_KEY } from "./browserStorage";

function storage<T>(operation: (storage: Storage) => T): T {
  try { return operation(localStorage); }
  catch (error) {
    throw new PersistenceError("storage_unavailable", `Browser storage could not be accessed: ${error instanceof Error ? error.message : "Unknown error"}`, 503);
  }
}

function revision(): number {
  return storage((storage) => {
    if (storage.getItem(STORAGE_KEY) === null) return 0;
    const raw = storage.getItem(REVISION_KEY);
    const value = raw === null ? NaN : Number(raw);
    return Number.isSafeInteger(value) && value > 0 ? value : 1;
  });
}

function parse(raw: string): unknown {
  try { return JSON.parse(raw); }
  catch { throw new PersistenceError("invalid_document", "The browser planner contains invalid JSON."); }
}

export function exportRawBrowserData(): string {
  return storage((storage) => serializeRawBrowserData(storage.getItem(STORAGE_KEY), storage.getItem(SETTINGS_KEY)));
}

export function clearBrowserData(): void {
  storage((storage) => {
    storage.removeItem(STORAGE_KEY);
    storage.removeItem(SETTINGS_KEY);
    storage.removeItem(REVISION_KEY);
  });
}

export const localPersistence: PlannerPersistence = {
  async session() { return { user_id: 1, csrf_token: "local" }; },
  async load() {
    const raw = storage((storage) => storage.getItem(STORAGE_KEY));
    if (raw === null) return { document: null, revision: 0, updated_at: null };
    const store = parse(raw);
    // Validate the store itself before spreading it, so primitives and arrays
    // cannot accidentally become valid documents.
    validateDocument(store);
    const settings = storage((storage) => storage.getItem(SETTINGS_KEY));
    const document = settings === null ? store : { ...store, settings: parse(settings) };
    validateDocument(document);
    return { document, revision: revision(), updated_at: new Date().toISOString() };
  },
  async save(document, expectedRevision) {
    validateDocument(document);
    if (revision() !== expectedRevision) throw new PersistenceError("revision_conflict", "Another tab or window changed the browser planner.", 409);
    const { settings, ...store } = document;
    storage((storage) => {
      storage.setItem(STORAGE_KEY, JSON.stringify(store));
      if (settings === undefined) storage.removeItem(SETTINGS_KEY);
      else storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      storage.setItem(REVISION_KEY, String(expectedRevision + 1));
    });
    return { document, revision: expectedRevision + 1, updated_at: new Date().toISOString() };
  },
  async logout() {},
};
