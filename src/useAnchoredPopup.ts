import { useLayoutEffect } from "react";

/** Measure before paint and keep a fixed-position popup aligned while open. */
export function useAnchoredPopup(open: boolean, updatePosition: () => void) {
  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);
}
