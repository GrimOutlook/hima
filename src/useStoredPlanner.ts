import { useEffect, useState } from "react";
import { loadStore, saveStore } from "./model";

export function useStoredPlanner() {
  const [loaded] = useState(loadStore);
  const [store, setStore] = useState(loaded.store);

  useEffect(() => {
    // Comparing with the loaded object skips every mount effect replay, not
    // just the first effect invocation in React StrictMode.
    if (loaded.canSave && (!loaded.warning || store !== loaded.store)) saveStore(store);
  }, [loaded, store]);

  return { store, setStore, storageWarning: loaded.warning };
}
