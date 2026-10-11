import { isHexColor } from "./model";

// Keep colors tied to pool IDs so renaming and reordering do not change them.
export const POOL_COLORS: readonly [string, ...string[]] = [
  "#60866b", "#668eae", "#b98a54", "#9475ad",
  "#bf747b", "#539b98", "#9b9b55", "#a97f64",
];

export function poolColor(poolId: number, customColor?: string): string {
  if (isHexColor(customColor)) return customColor;
  return POOL_COLORS[((poolId - 1) % POOL_COLORS.length + POOL_COLORS.length) % POOL_COLORS.length] ?? POOL_COLORS[0];
}
