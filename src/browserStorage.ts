export const STORAGE_KEY = "hima.store.v1";
export const SETTINGS_KEY = "hima.settings.v1";
export const REVISION_KEY = "hima.local.revision";
export const ACK_PREFIX = "hima.migration.v1.";

export function serializeRawBrowserData(store: string | null, settings: string | null): string {
  return JSON.stringify({ [STORAGE_KEY]: store, [SETTINGS_KEY]: settings }, null, 2);
}
