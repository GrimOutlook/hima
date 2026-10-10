import { useCallback, type RefObject } from "react";

/** Shared Tab navigation; callers retain ownership of Escape and focus restoration. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>) {
  const controls = useCallback(() => Array.from(ref.current?.querySelectorAll<HTMLElement>(
    'button, select, input:not([type="hidden"]), textarea, a[href], [tabindex]',
  ) ?? []).filter((element) => element.tabIndex >= 0 && !element.matches(":disabled") &&
    !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
    getComputedStyle(element).display !== "none" && getComputedStyle(element).visibility !== "hidden"), [ref]);

  const handleTab = useCallback((event: { key: string; shiftKey: boolean; defaultPrevented: boolean; preventDefault: () => void }) => {
    const container = ref.current;
    if (!container || event.defaultPrevented || event.key !== "Tab") return;
    const elements = controls();
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (!first || !container.contains(document.activeElement) || document.activeElement === container ||
      (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last ?? container : first ?? container).focus();
    }
  }, [controls, ref]);

  return { controls, handleTab };
}
