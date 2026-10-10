import { localPersistence } from "./localPersistence";
import { plannerApi } from "./plannerApi";

export const storageMode: "local" | "remote" = import.meta.env.MODE === "pages" ? "local" : "remote";
export const persistence = storageMode === "local" ? localPersistence : plannerApi;
