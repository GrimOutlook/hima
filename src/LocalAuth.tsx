import { useEffect, useState, type FormEvent } from "react";
import type { PlannerSession } from "./plannerPersistence";

async function readOptions(signal: AbortSignal): Promise<{ local: boolean; oidc: boolean }> {
  const response = await fetch("/auth/options", { signal });
  if (!response.ok) throw new Error("Could not load sign-in options.");
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || !("local" in value) || typeof value.local !== "boolean" || !("oidc" in value) || typeof value.oidc !== "boolean") {
    throw new Error("Could not load sign-in options.");
  }
  return { local: value.local, oidc: value.oidc };
}

export function SignIn() {
  const [options, setOptions] = useState<{ local: boolean; oidc: boolean } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void readOptions(controller.signal).then(setOptions).catch(() => {
      if (!controller.signal.aborted) setError("Could not load sign-in options.");
    });
    return () => controller.abort();
  }, [attempt]);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError("");
    try {
      const response = await fetch("/auth/local/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: data.get("username"), password: data.get("password") }),
      });
      if (!response.ok) {
        setError(response.status === 429 ? "Too many authentication requests. Try again later." : "Could not sign in. Check your username and password and try again.");
        return;
      }
      // Navigation reloads session/planner state; never retain the password.
      window.location.assign("/");
    } catch { setError("Could not reach the server. Try again."); }
    finally { form.reset(); setBusy(false); }
  }
  return <>
    {!options && !error && <p role="status">Loading sign-in options…</p>}
    {error && <p role="alert">{error}</p>}
    {!options && error && <button className="button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Retry sign-in options</button>}
    {options?.oidc && <a className="button button-primary" href="/auth/login">Sign in</a>}
    {options?.local && <form onSubmit={event => { void login(event); }} aria-label="Local sign in">
      <p><label>Username <input name="username" autoComplete="username" required minLength={3} maxLength={64} disabled={busy} /></label></p>
      <p><label>Password <input name="password" type="password" autoComplete="current-password" required maxLength={1024} disabled={busy} /></label></p>
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in with password"}</button>
    </form>}
    {options && !options.local && !options.oidc && <p role="alert">Authentication is not configured. Contact your administrator.</p>}
  </>;
}

export function ChangePassword({ saved = true, session }: { saved?: boolean; session: PlannerSession | null }) {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/auth/local/account", { signal: controller.signal }).then(async response => {
      if (response.ok) {
        const data: unknown = await response.json();
        if (!controller.signal.aborted && data && typeof data === "object" && "local" in data) setAvailable(data.local === true);
      }
    }).catch(() => {});
    return () => controller.abort();
  }, []);
  async function change(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!saved) { setError("Save or export your planner changes before changing your password."); return; }
    if (!session) { setError("Your session has expired. Reload and sign in again."); return; }
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get("new_password") !== data.get("confirm_password")) { setError("Passwords do not match."); return; }
    setBusy(true); setError("");
    try {
      // Use the session that loaded this planner, never a fresh token for a
      // potentially different account. A changed cookie must fail CSRF checks.
      const response = await fetch("/auth/local/password", {
        method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrf_token },
        body: JSON.stringify({ current_password: data.get("current_password"), new_password: data.get("new_password") }),
      });
      if (!response.ok) {
        setError(response.status === 429 ? "Too many authentication requests. Try again later." : "Could not change password. Check your current password and try again."); return;
      }
      // Recheck the controller session without navigating away: edits made while
      // hashing was in flight must remain exportable as an expired-session draft.
      setOpen(false);
      window.dispatchEvent(new Event("focus"));
    } catch { setError("Could not reach the server. Try again."); }
    finally { form.reset(); setBusy(false); }
  }
  if (!available) return null;
  return <section aria-label="Account password">
    <button className="button" type="button" onClick={() => { setOpen(value => !value); setError(""); }} disabled={busy || !saved}>{open ? "Cancel password change" : "Change password"}</button>
    {open && <form aria-label="Change password" onSubmit={event => { void change(event); }}>
      <p>Changing your password signs out all sessions. Save your planner changes first.</p>
      {error && <p role="alert">{error}</p>}
      <p><label>Current password <input name="current_password" type="password" autoComplete="current-password" required maxLength={1024} disabled={busy} /></label></p>
      <p><label>New password <input name="new_password" type="password" autoComplete="new-password" required minLength={15} maxLength={1024} disabled={busy} /></label></p>
      <p><label>Confirm new password <input name="confirm_password" type="password" autoComplete="new-password" required minLength={15} maxLength={1024} disabled={busy} /></label></p>
      <p>Use at least 15 characters (at most 1024 UTF-8 bytes).</p>
      <button className="button" type="submit" disabled={busy || !saved}>{busy ? "Changing password…" : "Change password and sign out everywhere"}</button>
    </form>}
  </section>;
}
