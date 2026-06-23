import { useEffect, type RefObject } from 'react';

/**
 * Enterprise dropdown dismissal — closes an open menu/dropdown when the user:
 *  • clicks anywhere outside it (page, another menu, a button, a table row, a
 *    nav item, an input, blank area), or
 *  • presses the Escape key.
 *
 * Uses document-level listeners (NOT an invisible backdrop overlay), so the
 * outside click ALSO reaches its real target — e.g. clicking "Employees" closes
 * the dropdown AND navigates. No blocked clicks, hidden overlays or focus traps.
 *
 * Pass the ref(s) of the element(s) considered "inside" (typically the dropdown's
 * container, which wraps both the toggle button and the panel). A click within
 * any provided ref is ignored so toggling/interacting stays intact.
 *
 * The listeners are only attached while `isOpen` is true and are fully removed on
 * close/unmount, so nothing lingers.
 */
export function useDismissable(
  isOpen: boolean,
  onClose: () => void,
  refs: RefObject<HTMLElement | null> | Array<RefObject<HTMLElement | null>>,
): void {
  useEffect(() => {
    if (!isOpen) return;
    const list = Array.isArray(refs) ? refs : [refs];

    const isInside = (target: Node | null) =>
      !!target && list.some(r => r.current && r.current.contains(target));

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!isInside(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); }
    };

    // Capture phase so we run before in-panel handlers stop propagation, but we
    // never preventDefault — the click still hits its real target.
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('touchstart', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('touchstart', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [isOpen, onClose, refs]);
}

export default useDismissable;
