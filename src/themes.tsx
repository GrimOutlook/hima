import { useEffect, useState } from "react";

type Mode = "light" | "dark";
export const themes = {
  light: [{ id: "garden", name: "Garden" }, { id: "coast", name: "Coast" }, { id: "lavender", name: "Lavender" }],
  dark: [{ id: "forest", name: "Forest" }, { id: "midnight", name: "Midnight" }, { id: "plum", name: "Plum" }],
} as const;
const STORAGE_KEY = "hima-appearance";
type Appearance = { mode: Mode; light: string; dark: string };

function readAppearance(): Appearance {
  const defaults: Appearance = { mode: "light", light: "garden", dark: "forest" };
  try {
    defaults.mode = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (stored && typeof stored === "object") {
      const value = stored as Record<string, unknown>;
      if (value.mode === "light" || value.mode === "dark") defaults.mode = value.mode;
      for (const mode of ["light", "dark"] as const) {
        if (themes[mode].some((theme) => theme.id === value[mode])) defaults[mode] = value[mode] as string;
      }
    }
  } catch { /* Appearance remains usable when browser storage is unavailable. */ }
  return defaults;
}

export function ThemeControls() {
  const [appearance, setAppearance] = useState(readAppearance);
  useEffect(() => {
    document.documentElement.dataset.theme = appearance[appearance.mode];
    document.documentElement.dataset.mode = appearance.mode;
  }, [appearance]);
  function updateAppearance(next: Appearance) {
    setAppearance(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Keep the in-memory selection. */ }
  }

  return <div className="theme-controls">
    <label className="theme-picker">
      <span>Theme</span>
      <select aria-label={`${appearance.mode === "light" ? "Light" : "Dark"} theme`} value={appearance[appearance.mode]}
        onChange={(event) => updateAppearance({ ...appearance, [appearance.mode]: event.target.value })}>
        <optgroup label={`${appearance.mode === "light" ? "Light" : "Dark"} themes`}>
          {themes[appearance.mode].map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
        </optgroup>
      </select>
    </label>
    <button className="button button-outline mode-toggle" type="button" aria-label="Dark mode" aria-pressed={appearance.mode === "dark"}
      title={`Switch to ${appearance.mode === "light" ? "dark" : "light"} mode`}
      onClick={() => updateAppearance({ ...appearance, mode: appearance.mode === "light" ? "dark" : "light" })}>
      <span aria-hidden="true">{appearance.mode === "dark" ? "☾" : "☀"}</span>
      <span>{appearance.mode === "dark" ? "Dark" : "Light"}</span>
    </button>
  </div>;
}
