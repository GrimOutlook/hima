import { useEffect, useRef, useState } from "react";
import { loadStore, saveStore, STORAGE_KEY } from "./model";

export function useStoredPlanner() {
  const [loaded] = useState(() => {
    let raw: string | null = null;
    try { raw = window.localStorage.getItem(STORAGE_KEY); } catch { /* loadStore reports read failures. */ }
    return { ...loadStore(), raw };
  });
  const expectedRaw = useRef(loaded.raw);
  const conflicted = useRef(false);
  const [conflict, setConflict] = useState(false);
  const [store, setStore] = useState(loaded.store);
  const [savedStore, setSavedStore] = useState<typeof store | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    function changed(event: StorageEvent) {
      if (event.storageArea !== window.localStorage || (event.key !== STORAGE_KEY && event.key !== null)) return;
      // Read the current value: queued events may describe an older write.
      try {
        if (window.localStorage.getItem(STORAGE_KEY) === expectedRaw.current) return;
      } catch { /* Stop saving if the current value cannot be verified. */ }
      conflicted.current = true;
      setConflict(true);
    }
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Comparing with the loaded object skips every mount effect replay, not
    // just the first effect invocation in React StrictMode.
    if (loaded.canSave && (!loaded.warning || store !== loaded.store)) {
      const save = () => {
        if (cancelled || conflicted.current) return;
        try {
          if (window.localStorage.getItem(STORAGE_KEY) !== expectedRaw.current) {
            conflicted.current = true;
            setConflict(true);
            return;
          }
        } catch {
          setSaveFailed(true);
          return;
        }
        const saved = saveStore(store);
        if (saved) expectedRaw.current = JSON.stringify(store);
        setSaveFailed(!saved);
        setSavedStore(saved ? store : null);
      };
      // Serialize the read/check/write across tabs, including before storage
      // notifications are delivered. Older browsers still get the value guard.
      if (navigator.locks) {
        void navigator.locks.request(STORAGE_KEY, save).catch(() => {
          if (!cancelled) setSaveFailed(true);
        });
      } else save();
    }
    return () => { cancelled = true; };
  }, [loaded, store]);

  const saveStatus = conflict || !loaded.canSave ? "disabled" : saveFailed ? "failed" : savedStore === store ? "saved" : "pending";
  const storageWarning = conflict
    ? "The planner was changed in another tab. Saving in this tab is disabled to protect both copies. Export a backup of this tab's changes, then reload this page to use the latest saved planner."
    : loaded.warning;
  return { store, setStore, storageWarning, saveStatus };
}
