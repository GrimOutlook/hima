import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPopup } from "./useAnchoredPopup";

export function SettingTooltip({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const trigger = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = (hovered || focused) && !dismissed;
  const { left, top } = useAnchoredPopup({ open, anchorRef: trigger, popupRef: bubble,
    placement: "above", gap: 6, clampVertical: true });

  return <span
    role="group" aria-label={label}
    ref={trigger}
    className="setting-tooltip"
    onMouseEnter={() => { setHovered(true); setDismissed(false); }}
    onMouseLeave={() => setHovered(false)}
    onFocus={() => { setFocused(true); setDismissed(false); }}
    onBlur={() => setFocused(false)}
  >
    <button type="button" className="icon-button" aria-label={label} aria-describedby={open ? id : undefined}
      onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setDismissed(true); } }}>ⓘ</button>
    {open && createPortal(
      <span ref={bubble} className="setting-tooltip-content" id={id} role="tooltip" style={{ left, top }}>{children}</span>,
      document.body,
    )}
  </span>;
}
