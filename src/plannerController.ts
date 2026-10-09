import { emptyStore } from "./model";
import { defaultSettings, PersistenceError, validateDocument, type PlannerDocument, type PlannerPersistence, type PlannerSession } from "./plannerPersistence";

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
};
const sameSession = (a: PlannerSession | null, b: PlannerSession) => a?.user_id === b.user_id && a.csrf_token === b.csrf_token;
const message = (error: unknown) => error instanceof Error ? error.message : "The server could not be reached.";

// All writes use the token from the session that loaded the draft. A changed
// cookie therefore cannot redirect an old draft into a different account.
export class PlannerController {
  private state: PlannerSnapshot = { phase: "loading", session: null, document: emptyStore(), revision: 0, saveStatus: "saved", error: null, generation: 0, recoveries: [] };
  private listeners = new Set<() => void>();
  private epoch = 0;
  private active = false;
  private abort = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private flight = false;
  private checking: Promise<void> | null = null;
  private saved = this.state.document;

  constructor(private persistence: PlannerPersistence, private debounceMs = 500) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
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
  private current(epoch: number) { return this.active && this.epoch === epoch; }
  private preserve() {
    if (this.state.session && this.state.document !== this.saved) {
      this.publish({ recoveries: [...this.state.recoveries, { userId: this.state.session.user_id, document: this.state.document }] });
      this.saved = this.state.document;
    }
  }
  start = () => { this.active = true; void this.refresh(); };
  stop = () => { this.active = false; this.cancel(); };

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
        this.publish({ phase: "loading", session: null, document: emptyStore(), revision: 0, saveStatus: "saved", error: null, generation: this.state.generation + 1 });
        try {
          const loaded = await this.persistence.load(loadSignal);
          const verified = await this.persistence.session(loadSignal);
          if (!this.current(loadEpoch)) return;
          if (!sameSession(session, verified)) {
            void this.refresh();
            return;
          }
          const document = loaded.document ?? { ...emptyStore(), settings: { ...defaultSettings } };
          validateDocument(document);
          this.saved = document;
          this.publish({ phase: "ready", session, document, revision: loaded.revision, error: null });
        } catch (error) { if (this.current(loadEpoch)) this.loadError(error); }
      } catch (error) { if (this.current(epoch)) this.loadError(error); }
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
    this.publish({ phase: error instanceof PersistenceError && error.status === 401 ? "signed-out" : "error", session: null, document: emptyStore(), error: message(error), generation: this.state.generation + 1 });
  }
  edit = (update: (document: PlannerDocument) => PlannerDocument, generation = this.state.generation) => {
    if (!this.active || this.state.phase !== "ready" || generation !== this.state.generation) return;
    const document = update(this.state.document);
    validateDocument(document);
    if (document === this.state.document) return;
    this.publish({ document, saveStatus: this.state.saveStatus === "conflict" ? "conflict" : this.state.saveStatus === "failed" ? "failed" : "pending" });
    this.schedule();
  };
  private schedule() {
    clearTimeout(this.timer);
    if (!this.active || this.state.phase !== "ready" || this.checking || this.flight || this.state.saveStatus !== "pending") return;
    this.timer = setTimeout(() => { void this.flush(); }, this.debounceMs);
  }
  private async flush() {
    if (!this.active || this.state.phase !== "ready" || this.checking || this.flight || this.state.saveStatus !== "pending" || !this.state.session) return;
    const { document, revision, session } = this.state;
    const epoch = this.epoch;
    this.flight = true;
    try {
      const result = await this.persistence.save(document, revision, session, this.abort.signal);
      if (!this.current(epoch)) return;
      if (result.revision !== revision + 1 || result.document === null) throw new PersistenceError("invalid_response", "The server returned an unexpected save revision. Reload before retrying.");
      // Acknowledgements update metadata only, never replace newer edits.
      this.saved = document;
      this.publish({ revision: result.revision, saveStatus: this.state.document === document ? "saved" : "pending", error: null });
    } catch (error) {
      if (!this.current(epoch)) return;
      const conflict = error instanceof PersistenceError && error.status === 409;
      this.publish({ saveStatus: conflict ? "conflict" : "failed", error: message(error) });
      // Keep the draft exportable on expiry or CSRF failure. Rechecking may
      // discover a new account, but will never reuse this draft or its revision.
      if (error instanceof PersistenceError && (error.status === 401 || error.status === 403)) void this.refresh();
    } finally {
      if (this.current(epoch)) { this.flight = false; this.schedule(); }
    }
  }
  retry = () => {
    if (this.state.phase !== "ready") { void this.refresh(); return; }
    if (this.state.saveStatus !== "failed") return;
    this.publish({ saveStatus: "pending", error: null });
    this.schedule();
  };
  logout = async (generation = this.state.generation) => {
    const session = this.state.session;
    if (!this.active || !session || this.state.phase !== "ready" || generation !== this.state.generation) return;
    this.cancel();
    const epoch = this.epoch;
    this.publish({ phase: "logging-out" });
    try {
      await this.persistence.logout(session, this.abort.signal);
      if (!this.current(epoch)) return;
      this.preserve();
      this.cancel();
      this.publish({ phase: "signed-out", session: null, document: emptyStore(), revision: 0, saveStatus: "saved", error: null, generation: this.state.generation + 1 });
    } catch (error) {
      if (!this.current(epoch)) return;
      if (error instanceof PersistenceError && error.status === 401) { this.loadError(error); return; }
      // An aborted PUT may have committed. Do not resume writes against a
      // potentially obsolete revision after a failed logout.
      this.publish({ phase: "ready", saveStatus: "failed", error: `Logout failed: ${message(error)}` });
      void this.refresh();
    }
  };
}
