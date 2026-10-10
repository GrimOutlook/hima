import { useCallback, type RefObject } from "react";

type TabEvent = Pick<KeyboardEvent, "key" | "shiftKey" | "defaultPrevented" | "preventDefault">;

/** Share tabbable-control discovery and boundary wrapping for dialog focus traps. */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>) {
  const controls = useCallback(() => Array.from(containerRef.current?.querySelectorAll<HTMLElement>(
    'button, select, input:not([type="hidden"]), textarea, a[href], [tabindex]',
  ) ?? []).filter((element) => element.tabIndex >= 0 && !element.matches(":disabled") &&
    !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
    getComputedStyle(element).display !== "none" && getComputedStyle(element).visibility !== "hidden"), [containerRef]);

  const handleTabKeyDown = useCallback((event: TabEvent) => {
    if (event.defaultPrevented || event.key !== "Tab") return;
    const container = containerRef.current;
    if (!container) return;
    const elements = controls();
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (!first || !container.contains(document.activeElement) || document.activeElement === container ||
      (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last ?? container : first ?? container).focus();
    }
  }, [containerRef, controls]);

  return { controls, handleTabKeyDown };
}
