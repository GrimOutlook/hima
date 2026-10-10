export function isFiniteHours(value: number): boolean {
  return Number.isFinite(value) && Number.isFinite(value * 100);
}

export function hasCentPrecision(value: number): boolean {
  return isFiniteHours(value) && Math.abs(value * 100 - Math.round(value * 100)) <= 1e-7;
}

// Normalize arithmetic before comparisons and avoid exposing negative zero.
export function roundHours(hours: number): number {
  return Math.round(hours * 100) / 100 || 0;
}

export function parseHours(value: string, allowZero = false): number | null {
  const amount = Number(value.trim());
  if (!hasCentPrecision(amount) || amount < 0 || (!allowZero && amount === 0)) return null;
  return roundHours(amount);
}

export function formatHours(value: number): string {
  const rounded = Math.sign(value) * Math.round(Math.abs(value) * 100) / 100;
  if (Math.abs(rounded) < 0.005) return "0";
  if (Math.abs(rounded % 1) < 0.005) return rounded.toFixed(0);
  return rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatSignedHours(value: number): string {
  if (value > 0) return `+${formatHours(value)}`;
  if (value < 0) return `−${formatHours(-value)}`;
  return "0";
}
