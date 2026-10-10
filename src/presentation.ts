import type { MouseEventHandler } from "react";

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

export function formatPercent(amount: number, total: number): string {
  return (amount / total * 100).toFixed(1);
}

// Buttons (and pool disclosures) handle their own actions instead of selecting the row.
export function selectOnRowClick(onSelect: () => void, controls = "button"): MouseEventHandler<HTMLElement> {
  return (event) => {
    if (event.target instanceof Element && event.target.closest(controls)) return;
    onSelect();
  };
}
