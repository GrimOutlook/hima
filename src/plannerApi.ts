import { PersistenceError, validateDocument, type PlannerPersistence, type PlannerSession, type StoredPlanner } from "./plannerPersistence";

async function request(path: string, signal: AbortSignal, init: RequestInit = {}, ignoreSuccessBody = false): Promise<unknown> {
  const response = await fetch(path, { ...init, signal, credentials: "same-origin", cache: "no-store" });
  // Logout returns a redirect to the HTML app; fetch follows it. Its success
  // body is not an API document and must not be parsed as JSON.
  if (response.ok && (ignoreSuccessBody || response.status === 204)) return undefined;
  let body: unknown;
  try { body = await response.json(); } catch { throw new PersistenceError("invalid_response", "The server returned an unreadable response.", response.status); }
  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new PersistenceError(error?.code ?? "request_failed", error?.message ?? "The request failed.", response.status);
  }
  return body;
}

function stored(value: unknown): StoredPlanner {
  const body = value as Partial<StoredPlanner> | null;
  if (!body || !Number.isSafeInteger(body.revision) || body.revision! < 0 ||
    (body.document === null ? body.revision !== 0 || body.updated_at !== null : body.revision! < 1 || typeof body.updated_at !== "string")) {
    throw new PersistenceError("invalid_response", "The server returned invalid planner metadata.");
  }
  if (body.document !== null) validateDocument(body.document);
  return body as StoredPlanner;
}

export const plannerApi: PlannerPersistence = {
  async session(signal) {
    const body = await request("/api/me", signal) as PlannerSession | null;
    if (!body || !Number.isSafeInteger(body.user_id) || body.user_id <= 0 || typeof body.csrf_token !== "string" || !body.csrf_token) {
      throw new PersistenceError("invalid_response", "The server returned an invalid session.");
    }
    return body;
  },
  async load(signal) { return stored(await request("/api/planner", signal)); },
  async save(document, revision, session, signal) {
    validateDocument(document);
    return stored(await request("/api/planner", signal, {
      method: "PUT", headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrf_token },
      body: JSON.stringify({ expected_revision: revision, document }),
    }));
  },
  async logout(session, signal) {
    await request("/auth/logout", signal, { method: "POST", headers: { "X-CSRF-Token": session.csrf_token } }, true);
  },
};
