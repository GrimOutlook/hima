import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function SettingTooltip({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const trigger = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const open = (hovered || focused) && !dismissed;

  useLayoutEffect(() => {
    if (!open) return;
    function updatePosition() {
      if (!trigger.current || !bubble.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      const tooltip = bubble.current.getBoundingClientRect();
      const margin = 8;
      const above = anchor.top - tooltip.height - 6;
      setPosition({
        left: Math.max(margin, Math.min(anchor.right - tooltip.width, window.innerWidth - tooltip.width - margin)),
        top: Math.max(margin, Math.min(above >= margin ? above : anchor.bottom + 6, window.innerHeight - tooltip.height - margin)),
      });
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

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
      <span ref={bubble} className="setting-tooltip-content" id={id} role="tooltip" style={position}>{children}</span>,
      document.body,
    )}
  </span>;
}
