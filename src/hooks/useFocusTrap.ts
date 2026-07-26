import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTORS =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Traps keyboard focus within `containerRef` while `enabled` is true.
 *
 * - On enable: saves the previously focused element and moves focus to the
 *   first focusable child inside the container.
 * - Tab / Shift+Tab: cycles only within focusable children.
 * - On disable: restores focus to the element that was active before trapping.
 *
 * Zero external dependencies.
 */
export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  // Keep a ref to the element that was focused before the trap was enabled
  // so we can restore it when the modal closes.
  const previouslyFocusedRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!enabled) {
      // Restore focus to the element that was focused before the trap opened.
      if (previouslyFocusedRef.current instanceof HTMLElement) {
        previouslyFocusedRef.current.focus();
      }
      previouslyFocusedRef.current = null;
      return;
    }

    // Save current focus so we can restore it on close.
    previouslyFocusedRef.current = document.activeElement;

    const container = containerRef.current;
    if (!container) return;

    // Move focus into the container immediately.
    const firstFocusable = container.querySelector<HTMLElement>(FOCUSABLE_SELECTORS);
    if (firstFocusable) {
      firstFocusable.focus();
    } else {
      // Fall back to the container itself (requires tabIndex={-1} on it).
      container.focus();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;

      const focusable = Array.from(
        container!.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS),
      ).filter(el => !el.closest('[hidden]') && el.offsetParent !== null);

      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        // Shift+Tab: if focus would leave the top, wrap to the last element.
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if focus would leave the bottom, wrap to the first element.
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, containerRef]);
}
