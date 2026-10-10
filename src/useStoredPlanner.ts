import { useCallback, useEffect, useState, useSyncExternalStore, type SetStateAction } from "react";
import type { Store } from "./model";
import type { BackupSettings } from "./backup";
import { plannerApi } from "./plannerApi";
import { PlannerController } from "./plannerController";
import { browserLocalSource } from "./localMigration";
import { defaultSettings, type PlannerPersistence } from "./plannerPersistence";

export function useStoredPlanner(persistence: PlannerPersistence = plannerApi) {
  const [controller] = useState(() => new PlannerController(persistence, 500, browserLocalSource));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useEffect(() => {
    controller.start();
    const refresh = () => { if (document.visibilityState !== "hidden") void controller.refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      controller.stop();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(interval);
    };
  }, [controller]);
  const generation = snapshot.generation;
  const setStore = useCallback((update: SetStateAction<Store>) => {
    controller.edit((document) => ({ ...(typeof update === "function" ? update(document) : update), ...(document.settings ? { settings: document.settings } : {}) }), generation);
  }, [controller, generation]);
  const setSettings = useCallback((update: Partial<BackupSettings>) => {
    controller.edit((document) => ({ ...document, settings: { ...defaultSettings, ...document.settings, ...update } }), generation);
  }, [controller, generation]);
  const importBackup = useCallback((store: Store, settings?: BackupSettings) => {
    controller.edit((document) => ({ ...store, settings: settings ?? document.settings ?? { ...defaultSettings } }), generation);
  }, [controller, generation]);
  const logout = useCallback(() => controller.logout(generation), [controller, generation]);
  return { ...snapshot, store: snapshot.document, settings: snapshot.document.settings ?? defaultSettings,
    setStore, setSettings, importBackup, retry: controller.retry, logout,
    migrate: () => controller.migrate(generation), chooseRemote: () => controller.chooseRemote(generation),
    finishLocalMigration: (remove: boolean) => controller.finishLocalMigration(remove, generation),
    fetchLatest: () => controller.fetchLatest(generation), resolveConflict: (replace: boolean) => controller.resolveConflict(replace, generation) };
}
