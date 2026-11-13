// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChangePassword as PasswordForm, SignIn } from "./LocalAuth";
function ChangePassword({ saved = true }: { saved?: boolean }) {
  return <PasswordForm saved={saved} session={{ user_id: 1, csrf_token: "session-bound" }} />;
}

let root: Root;
let container: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(async (url: string) => reply(url === "/auth/options" ? { local: true, oidc: false } : { local: true }));
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
});
function input(name: string, value: string) { container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!.value = value; }
async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }

it("only offers enabled authentication methods", async () => {
  await act(async () => root.render(<SignIn />));
  expect(container.querySelector('a[href="/auth/login"]')).toBeNull();
  expect(container.querySelector('input[autocomplete="username"]')).not.toBeNull();
  expect(container.querySelector('input[autocomplete="current-password"]')).not.toBeNull();
});
it("retains the OIDC-only sign in experience", async () => {
  fetchMock.mockResolvedValue(reply({ local: false, oidc: true }));
  await act(async () => root.render(<SignIn />));
  expect(container.querySelector('a[href="/auth/login"]')?.textContent).toBe("Sign in");
  expect(container.querySelector("form")).toBeNull();
});
it("offers both methods when configured and reports disabled authentication", async () => {
  fetchMock.mockResolvedValue(reply({ local: true, oidc: true }));
  await act(async () => root.render(<SignIn />));
  expect(container.querySelector('a[href="/auth/login"]')).not.toBeNull();
  expect(container.querySelector("form")).not.toBeNull();
  await act(async () => root.unmount()); root = createRoot(container);
  fetchMock.mockResolvedValue(reply({ local: false, oidc: false }));
  await act(async () => root.render(<SignIn />));
  expect(container.textContent).toContain("Authentication is not configured");
});
it("posts credentials only to the backend, shows generic failure and clears passwords", async () => {
  await act(async () => root.render(<SignIn />));
  input("username", "alice"); input("password", "a private long password");
  fetchMock.mockResolvedValue(reply({}, 401));
  await submit();
  expect(fetchMock).toHaveBeenLastCalledWith("/auth/local/login", expect.objectContaining({
    method: "POST", body: JSON.stringify({ username: "alice", password: "a private long password" }),
  }));
  expect(container.textContent).toContain("Check your username and password");
  expect(container.querySelector<HTMLInputElement>('input[name="password"]')!.value).toBe("");
  expect(localStorage.length).toBe(0);
});
it("handles throttling and unavailable options without exposing forms", async () => {
  fetchMock.mockRejectedValue(new Error("offline"));
  await act(async () => root.render(<SignIn />));
  expect(container.querySelector("form")).toBeNull();
  expect(container.textContent).toContain("Could not load sign-in options");
  fetchMock.mockResolvedValue(reply({ local: true, oidc: false }));
  await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
  input("username", "alice"); input("password", "a private long password");
  fetchMock.mockResolvedValue(reply({}, 429));
  await submit();
  expect(container.textContent).toContain("Too many authentication requests");
});
it("requires matching passwords and a session-bound CSRF token for changes", async () => {
  await act(async () => root.render(<ChangePassword />));
  await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
  input("current_password", "current password phrase"); input("new_password", "a replacement password phrase"); input("confirm_password", "does not match");
  await submit();
  expect(container.textContent).toContain("Passwords do not match");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  input("confirm_password", "a replacement password phrase");
  fetchMock.mockImplementation(async (url: string) => url === "/api/me" ? reply({ csrf_token: "session-bound" }) : reply({}, 401));
  await submit();
  expect(fetchMock).toHaveBeenLastCalledWith("/auth/local/password", expect.objectContaining({
    headers: { "Content-Type": "application/json", "X-CSRF-Token": "session-bound" },
    body: JSON.stringify({ current_password: "current password phrase", new_password: "a replacement password phrase" }),
  }));
  expect(container.textContent).toContain("Could not change password");
  expect(container.querySelector<HTMLInputElement>('input[name="current_password"]')!.value).toBe("");
});
it("rechecks the session after password change without navigating away from recoverable drafts", async () => {
  await act(async () => root.render(<ChangePassword />));
  await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
  input("current_password", "current password phrase"); input("new_password", "a replacement password phrase"); input("confirm_password", "a replacement password phrase");
  const focus = vi.fn(); window.addEventListener("focus", focus);
  fetchMock.mockImplementation(async (url: string) => url === "/api/me" ? reply({ csrf_token: "session-bound" }) : reply({}));
  await submit();
  expect(focus).toHaveBeenCalledTimes(1);
  expect(container.querySelector("form")).toBeNull();
  window.removeEventListener("focus", focus);
});
it("does not offer password change to external accounts or while planner saves are pending", async () => {
  fetchMock.mockResolvedValue(reply({ local: false }));
  await act(async () => root.render(<ChangePassword />));
  expect(container.querySelector("button")).toBeNull();
  await act(async () => root.unmount()); root = createRoot(container);
  fetchMock.mockResolvedValue(reply({ local: true }));
  await act(async () => root.render(<ChangePassword saved={false} />));
  expect(container.querySelector<HTMLButtonElement>("button")!.disabled).toBe(true);
});
