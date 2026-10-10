import { emptyStore } from "./model";
import type { LocalMigration, LocalSource } from "./localMigration";
import {
  PersistenceError,
  validateDocument,
  type PlannerDocument,
  type PlannerPersistence,
  type PlannerSession,
} from "./plannerPersistence";
import { defaultSettings } from "./settings";

export type SaveStatus = "saved" | "pending" | "failed" | "conflict";
export type PlannerSnapshot = {
  phase: "loading" | "signed-out" | "ready" | "error" | "logging-out";
  session: PlannerSession | null;
  document: PlannerDocument;
  revision: number;
  saveStatus: SaveStatus;
  error: string | null;
  generation: number;
  recoveries: { userId: number; document: PlannerDocument }[];
  migration?: LocalMigration | null;
  migratedLocal?: LocalMigration | null;
  resolving?: boolean;
  latest?: { document: PlannerDocument; revision: number } | null;
};
const sameSession = (a: PlannerSession | null, b: PlannerSession) =>
  a?.user_id === b.user_id && a.csrf_token === b.csrf_token;
const message = (error: unknown) =>
  error instanceof Error ? error.message : "The server could not be reached.";
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, entry) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
      : entry,
  );

// All writes use the token from the session that loaded the draft. A changed
// cookie therefore cannot redirect an old draft into a different account.
export class PlannerController {
  private state: PlannerSnapshot = {
    phase: "loading",
    session: null,
    document: emptyStore(),
    revision: 0,
    saveStatus: "saved",
    error: null,
    generation: 0,
    recoveries: [],
  };
  private listeners = new Set<() => void>();
  private epoch = 0;
  private active = false;
  private abort = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private flight = false;
  private checking: Promise<void> | null = null;
  private saved = this.state.document;

  constructor(
    private persistence: PlannerPersistence,
    private debounceMs = 500,
    private local?: LocalSource,
  ) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<PlannerSnapshot>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private cancel() {
    this.epoch++;
    this.abort.abort();
    this.abort = new AbortController();
    clearTimeout(this.timer);
    this.flight = false;
    this.checking = null;
  }
  // Epochs guard asynchronous work; generations guard callbacks from old views.
  private current(epoch: number) {
    return this.active && this.epoch === epoch;
  }
  private isReady(generation = this.state.generation) {
    return this.active && this.state.phase === "ready" && generation === this.state.generation;
  }
  private resetState(patch: Partial<PlannerSnapshot>) {
    this.publish({
      session: null,
      document: emptyStore(),
      error: null,
      generation: this.state.generation + 1,
      ...patch,
    });
  }
  private async loadValidated(session: PlannerSession, epoch: number, signal: AbortSignal) {
    const loaded = await this.persistence.load(signal);
    const verified = await this.persistence.session(signal);
    if (!this.current(epoch)) return null;
    if (!sameSession(session, verified)) {
      void this.refresh();
      return null;
    }
    const document = loaded.document ?? { ...emptyStore(), settings: { ...defaultSettings } };
    validateDocument(document);
    return { document, revision: loaded.revision };
  }
  private handleAuthError(error: unknown) {
    if (error instanceof PersistenceError && (error.status === 401 || error.status === 403)) {
      void this.refresh();
    }
  }
  private preserve() {
    if (this.state.session && this.state.document !== this.saved) {
      this.publish({
        recoveries: [
          ...this.state.recoveries,
          { userId: this.state.session.user_id, document: this.state.document },
        ],
      });
      this.saved = this.state.document;
    }
  }
  start = () => {
    this.active = true;
    void this.refresh();
  };
  stop = () => {
    this.active = false;
    this.cancel();
  };

  refresh = (): Promise<void> => {
    if (!this.active || this.state.phase === "logging-out") return Promise.resolve();
    if (this.checking) return this.checking;
    const epoch = this.epoch;
    const signal = this.abort.signal;
    const run = async () => {
      try {
        const session = await this.persistence.session(signal);
        if (!this.current(epoch)) return;
        if (sameSession(this.state.session, session) && this.state.phase === "ready") return;
        // Invalidate loads, writes and queued callbacks from the previous account.
        this.preserve();
        this.cancel();
        const loadEpoch = this.epoch;
        const loadSignal = this.abort.signal;
        this.resetState({ phase: "loading", revision: 0, saveStatus: "saved" });
        try {
          const loaded = await this.loadValidated(session, loadEpoch, loadSignal);
          if (!loaded || !this.current(loadEpoch)) return;
          const { document, revision } = loaded;
          const migration = await this.local?.read(session.user_id) ?? null;
          if (!this.current(loadEpoch)) return;
          this.saved = document;
          this.publish({
            phase: "ready", session, document, revision, error: null,
            migration, migratedLocal: null, latest: null, resolving: false,
          });
        } catch (error) {
          if (this.current(loadEpoch)) this.loadError(error);
        }
      } catch (error) {
        if (this.current(epoch)) this.loadError(error);
      }
    };
    const promise = run();
    this.checking = promise;
    void promise.finally(() => {
      if (this.checking === promise) this.checking = null;
      this.schedule();
    });
    return promise;
  };
  private loadError(error: unknown) {
    this.preserve();
    this.cancel();
    this.resetState({
      phase: error instanceof PersistenceError && error.status === 401 ? "signed-out" : "error",
      error: message(error),
    });
  }
  edit = (update: (document: PlannerDocument) => PlannerDocument, generation = this.state.generation) => {
    if (!this.isReady(generation) || this.state.migration) return;
    const document = update(this.state.document);
    validateDocument(document);
    if (document === this.state.document) return;
    this.publish({
      document,
      saveStatus: this.state.saveStatus === "conflict" ? "conflict"
        : this.state.saveStatus === "failed" ? "failed" : "pending",
    });
    this.schedule();
  };
  private schedule() {
    clearTimeout(this.timer);
    if (!this.isReady() || this.state.migration || this.state.resolving ||
      this.checking || this.flight || this.state.saveStatus !== "pending") return;
    this.timer = setTimeout(() => {
      void this.flush();
    }, this.debounceMs);
  }
  private async flush() {
    if (!this.isReady() || this.checking || this.flight ||
      this.state.saveStatus !== "pending" || !this.state.session) return;
    const { document, revision, session } = this.state;
    const epoch = this.epoch;
    this.flight = true;
    try {
      const result = await this.persistence.save(document, revision, session, this.abort.signal);
      if (!this.current(epoch)) return;
      if (result.revision !== revision + 1 || result.document === null) {
        throw new PersistenceError("invalid_response", "The server returned an unexpected save revision. Reload before retrying.");
      }
      // Acknowledgements update metadata only, never replace newer edits.
      this.saved = document;
      this.publish({
        revision: result.revision,
        saveStatus: this.state.document === document ? "saved" : "pending",
        error: null,
      });
    } catch (error) {
      if (!this.current(epoch)) return;
      const conflict = error instanceof PersistenceError && error.status === 409;
      this.publish({ saveStatus: conflict ? "conflict" : "failed", error: message(error), latest: null });
      // Keep the draft exportable on expiry or CSRF failure. Rechecking may
      // discover a new account, but will never reuse this draft or its revision.
      this.handleAuthError(error);
    } finally {
      if (this.current(epoch)) {
        this.flight = false;
        this.schedule();
      }
    }
  }
  retry = () => {
    if (this.state.phase !== "ready") {
      void this.refresh();
      return;
    }
    if (this.state.saveStatus !== "failed") return;
    this.publish({ saveStatus: "pending", error: null });
    this.schedule();
  };
  chooseRemote = (generation = this.state.generation) => {
    if (!this.isReady(generation) || !this.state.migration || this.state.resolving) return;
    this.publish({ migration: null, error: null });
  };
  migrate = async (generation = this.state.generation) => {
    const { migration, session } = this.state;
    if (!this.isReady(generation) || !migration?.document || !session || this.state.resolving) return;
    const epoch = this.epoch;
    this.publish({ resolving: true, error: null });
    try {
      const verified = await this.persistence.session(this.abort.signal);
      if (!this.current(epoch)) return;
      if (!sameSession(session, verified)) {
        void this.refresh();
        return;
      }
      const result = await this.persistence.save(migration.document, this.state.revision, session, this.abort.signal);
      if (!this.current(epoch)) return;
      if (result.revision !== this.state.revision + 1 || canonical(result.document) !== canonical(migration.document)) {
        throw new Error("Migration was not confirmed by the server.");
      }
      this.local?.confirm(session.user_id, migration.fingerprint);
      this.saved = migration.document;
      this.publish({
        document: migration.document, revision: result.revision, migration: null,
        migratedLocal: migration, saveStatus: "saved", generation: this.state.generation + 1,
      });
    } catch (error) {
      if (this.current(epoch)) {
        this.publish({ error: message(error) });
        if (error instanceof PersistenceError && error.status === 409) {
          try {
            const loaded = await this.loadValidated(session, epoch, this.abort.signal);
            if (!loaded || !this.current(epoch)) return;
            const { document, revision } = loaded;
            this.saved = document;
            this.publish({
              document, revision,
              error: "The remote copy changed. Review/export the latest remote copy, then explicitly choose again.",
            });
          } catch (loadError) {
            if (this.current(epoch)) this.publish({ error: message(loadError) });
          }
        }
        this.handleAuthError(error);
      }
    } finally {
      if (this.current(epoch)) this.publish({ resolving: false });
    }
  };
  finishLocalMigration = (remove: boolean, generation = this.state.generation) => {
    if (!this.isReady(generation) || !this.state.migratedLocal) return;
    try {
      if (remove) this.local?.remove?.(this.state.migratedLocal.raw);
      this.publish({ migratedLocal: null, error: null });
    } catch (error) {
      this.publish({ error: message(error) });
    }
  };
  fetchLatest = async (generation = this.state.generation) => {
    const session = this.state.session;
    if (!this.isReady(generation) || !session || this.state.resolving || this.state.saveStatus !== "conflict") return;
    const epoch = this.epoch;
    this.publish({ resolving: true, latest: null });
    try {
      const loaded = await this.loadValidated(session, epoch, this.abort.signal);
      if (!loaded || !this.current(epoch)) return;
      this.publish({ latest: loaded, error: null });
    } catch (error) {
      if (this.current(epoch)) {
        this.publish({ error: message(error) });
        this.handleAuthError(error);
      }
    } finally {
      if (this.current(epoch)) this.publish({ resolving: false });
    }
  };
  resolveConflict = (replace: boolean, generation = this.state.generation) => {
    const latest = this.state.latest;
    if (!this.isReady(generation) || this.state.resolving || this.state.saveStatus !== "conflict" || !latest) return;
    if (!replace) {
      this.preserve();
      this.saved = latest.document;
    }
    this.publish({
      document: replace ? this.state.document : latest.document,
      revision: latest.revision,
      latest: null,
      saveStatus: replace ? "pending" : "saved",
      error: null,
      generation: replace ? this.state.generation : this.state.generation + 1,
    });
    this.schedule();
  };
  logout = async (generation = this.state.generation, everywhere = false) => {
    const session = this.state.session;
    if (!this.isReady(generation) || !session) return;
    this.cancel();
    const epoch = this.epoch;
    this.publish({ phase: "logging-out" });
    try {
      await this.persistence.logout(session, this.abort.signal, everywhere);
      if (!this.current(epoch)) return;
      this.preserve();
      this.cancel();
      this.resetState({ phase: "signed-out", revision: 0, saveStatus: "saved" });
    } catch (error) {
      if (!this.current(epoch)) return;
      if (error instanceof PersistenceError && error.status === 401) {
        this.loadError(error);
        return;
      }
      // An aborted PUT may have committed. Do not resume writes against a
      // potentially obsolete revision after a failed logout.
      this.publish({
        phase: "ready", saveStatus: "failed", resolving: false,
        latest: null, error: `Logout failed: ${message(error)}`,
      });
      void this.refresh();
    }
  };
}
