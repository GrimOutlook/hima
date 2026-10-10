import { afterEach, expect, it, vi } from "vitest";
import { plannerApi } from "./plannerApi";
import { emptyStore } from "./model";
import { validateDocument } from "./plannerPersistence";
import { defaultSettings } from "./settings";

afterEach(() => vi.unstubAllGlobals());
it.each([undefined, null, {}, { user_id: 1, csrf_token: "" }, { user_id: 0, csrf_token: "token" }])("rejects unverified load identities (%j)", async (identity) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ document: null, revision: 0, updated_at: null, session: identity })));
  await expect(plannerApi.load(new AbortController().signal)).rejects.toMatchObject({ code: "invalid_response" });
});
const signal = new AbortController().signal;
const session = { user_id: 1, csrf_token: "session-bound-token" };
it("revokes every session through a cookie-authenticated CSRF-protected request", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("<html></html>"));
  vi.stubGlobal("fetch", fetch);
  await plannerApi.logout(session, signal, true);
  expect(fetch).toHaveBeenCalledWith("/auth/logout-all", expect.objectContaining({ method: "POST", credentials: "same-origin", headers: { "X-CSRF-Token": session.csrf_token } }));
});
it("uses relative cookie-authenticated no-store requests and session-bound CSRF mutations", async () => {
  const document = { ...emptyStore(), settings: defaultSettings };
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(session))
    .mockResolvedValueOnce(Response.json({ document: null, revision: 0, updated_at: null, session }))
    .mockResolvedValueOnce(Response.json({ revision: 1, updated_at: "2026-10-09T12:00:00Z" }))
    .mockResolvedValueOnce(new Response("<!doctype html><title>hima</title>", { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  expect(await plannerApi.session(signal)).toEqual(session);
  expect(await plannerApi.load(signal)).toEqual({ document: null, revision: 0, updated_at: null, session });
  expect(await plannerApi.save(document, 0, session, signal)).toEqual({ revision: 1, updated_at: "2026-10-09T12:00:00Z" });
  await plannerApi.logout(session, signal);
  for (const [, options] of fetch.mock.calls) expect(options).toMatchObject({ signal, credentials: "same-origin", cache: "no-store" });
  expect(fetch).toHaveBeenNthCalledWith(3, "/api/planner", expect.objectContaining({ method: "PUT", headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrf_token }, body: JSON.stringify({ expected_revision: 0, document }) }));
  expect(fetch).toHaveBeenNthCalledWith(4, "/auth/logout", expect.objectContaining({ method: "POST", headers: { "X-CSRF-Token": session.csrf_token } }));
});

it("requests and validates a document echo only for migration", async () => {
  const document = emptyStore();
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ document, revision: 1, updated_at: "now" }))
    .mockResolvedValueOnce(Response.json({ revision: 2, updated_at: "now" }))
    .mockResolvedValueOnce(Response.json({ document: { ...document, version: 2 }, revision: 2, updated_at: "now" }));
  vi.stubGlobal("fetch", fetch);
  expect(await plannerApi.save(document, 0, session, signal, { echoDocument: true })).toEqual({ document, revision: 1, updated_at: "now" });
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ document, expected_revision: 0, echo_document: true });
  await expect(plannerApi.save(document, 1, session, signal, { echoDocument: true })).rejects.toThrow();
  await expect(plannerApi.save(document, 1, session, signal, { echoDocument: true })).rejects.toThrow();
});

it.each([null, {}, { revision: 0, updated_at: "now" }, { revision: 1.5, updated_at: "now" }, { revision: Number.MAX_SAFE_INTEGER + 1, updated_at: "now" }, { revision: 1, updated_at: null }])("rejects malformed save metadata (%j)", async (body) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
  await expect(plannerApi.save(emptyStore(), 0, session, signal)).rejects.toMatchObject({ code: "invalid_response" });
});

it.each([401, 403, 409, 422, 503])("preserves structured errors (%s) for auth, validation, conflict and retry handling", async (status) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code: "test_code", message: "Safe message" } }, { status })));
  await expect(plannerApi.load(signal)).rejects.toMatchObject({ code: "test_code", message: "Safe message", status });
});

it.each([
  { document: { ...emptyStore(), version: 2 }, revision: 1, updated_at: "now" },
  { document: { ...emptyStore(), pools: [{ id: 1, name: "Broken" }] }, revision: 1, updated_at: "now" },
  { document: null, revision: 1, updated_at: null },
  { document: emptyStore(), revision: Number.MAX_SAFE_INTEGER + 1, updated_at: "now" },
])("rejects malformed/unsupported responses rather than repairing and saving them", async (body) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
  await expect(plannerApi.load(signal)).rejects.toThrow();
});

it("preserves valid remote field values and ordering without normalization", async () => {
  const document = { ...emptyStore(), pools: [{ id: 1, name: " Leave ", hidden_from_graph: false, additions: [], recurring: [], caps: [
    { id: 3, max_balance: 0, start_date: "2026-02-01", end_date: "2026-02-28" },
    { id: 2, max_balance: 10, start_date: "2026-01-01", end_date: "2026-01-31" },
  ] }], next_id: 4 };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ document, revision: 5, updated_at: "now", session })));
  expect((await plannerApi.load(signal)).document).toEqual(document);
});

it.each([
  { ...emptyStore(), unexpected: true },
  { ...emptyStore(), next_id: 0 },
  { ...emptyStore(), settings: { ...defaultSettings, ignoreWeekends: "false" } },
  { ...emptyStore(), pools: [{ id: 1, name: "Leave", additions: [{ id: 2, amount: 1.111, date: "2026-01-01" }], recurring: [], caps: [] }], next_id: 3 },
])("rejects invalid outgoing documents before making a request", async (document) => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  expect(() => validateDocument(document)).toThrow();
  await expect(plannerApi.save(document as ReturnType<typeof emptyStore>, 0, session, signal)).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
