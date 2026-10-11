import { useLayoutEffect, useState, type RefObject } from "react";

interface AnchoredPopupOptions {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  popupRef: RefObject<HTMLElement | null>;
  placement: "above" | "below";
  gap: number;
  width?: number;
  height?: number;
  clampVertical?: boolean;
}

/** Position a portalled popup before paint and follow scrolling ancestors. */
export function useAnchoredPopup({ open, anchorRef, popupRef, placement, gap, width: preferredWidth, height: preferredHeight, clampVertical = false }: AnchoredPopupOptions) {
  const [position, setPosition] = useState({ top: 0, left: 0, width: preferredWidth ?? 0 });

  useLayoutEffect(() => {
    if (!open) return;
    function updatePosition() {
      if (!anchorRef.current || !popupRef.current) return;
      const anchor = anchorRef.current.getBoundingClientRect();
      const popup = popupRef.current.getBoundingClientRect();
      const margin = 8;
      const width = preferredWidth === undefined ? popup.width : Math.min(preferredWidth, window.innerWidth - margin * 2);
      const height = preferredHeight ?? popup.height;
      const above = anchor.top - height - gap;
      const below = anchor.bottom + gap;
      const left = Math.max(margin, Math.min(anchor.right - width, window.innerWidth - width - margin));
      let top = placement === "above"
        ? above >= margin ? above : below
        : below + height <= window.innerHeight ? below : above;
      if (clampVertical) top = Math.min(top, window.innerHeight - height - margin);
      top = Math.max(margin, top);
      setPosition((current) => current.top === top && current.left === left && current.width === width
        ? current : { top, left, width });
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, anchorRef, popupRef, placement, gap, preferredWidth, preferredHeight, clampVertical]);

  return position;
}
