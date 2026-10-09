import { useEffect, useState } from "react";
import { loadStore, saveStore } from "./model";

export function useStoredPlanner() {
  const [loaded] = useState(loadStore);
  const [store, setStore] = useState(loaded.store);
  const [savedStore, setSavedStore] = useState<typeof store | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    // Comparing with the loaded object skips every mount effect replay, not
    // just the first effect invocation in React StrictMode.
    if (loaded.canSave && (!loaded.warning || store !== loaded.store)) {
      const saved = saveStore(store);
      setSaveFailed(!saved);
      setSavedStore(saved ? store : null);
    }
  }, [loaded, store]);

  const saveStatus = !loaded.canSave ? "disabled" : saveFailed ? "failed" : savedStore === store ? "saved" : "pending";
  return { store, setStore, storageWarning: loaded.warning, saveStatus };
}
