import { localPersistence } from "./localPersistence";
import { plannerApi } from "./plannerApi";

export type StorageMode = "local" | "remote";
export const storageMode: StorageMode = import.meta.env.MODE === "pages" ? "local" : "remote";
export const persistence = storageMode === "local" ? localPersistence : plannerApi;
