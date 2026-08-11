/**
 * useFocusTrap — confines keyboard focus to a container while it is
 * mounted, and restores focus to the previously-focused element on
 * unmount.
 *
 * Usage
 * -----
 * ```tsx
 * const trapRef = useFocusTrap<HTMLDivElement>(open)
 * return open ? <div ref={trapRef} role="dialog" aria-modal="true">…</div> : null
 * ```
 *
 * Behaviour
 * ---------
 *  - When `active` flips to `true`, the hook:
 *      1. remembers `document.activeElement` (the trigger);
 *      2. focuses the first focusable element inside the trap, or
 *         the container itself when none is focusable.
 *  - While `active` is `true`, Tab / Shift+Tab cycle inside the
 *    container. Escape does **not** close the modal — that is the
 *    caller's responsibility (it usually wants to know which key was
 *    pressed, so it can render the right confirm flow).
 *  - When `active` flips to `false`, the previous focus is restored.
 *
 * Why hand-rolled and not `@reach/focus-lock` / `focus-trap-react`?
 * The library is 2 KB of code and we want zero new dependencies for
 * the MVP. The implementation covers the WCAG 2.4.3 / 2.1.2 contract
 * (focusable order, no escape, restoration on close).
 */
import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

/**
 * Selector for elements that should not steal focus from the trap
 * (e.g. the modal backdrop). We still include them in the cycle when
 * they are explicitly focusable.
 */
function isFocusable(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.hasAttribute('disabled')) return false
  if (el.getAttribute('aria-hidden') === 'true') return false
  return el.matches(FOCUSABLE_SELECTOR)
}

export function useFocusTrap<T extends HTMLElement = HTMLElement>(
  active: boolean,
): RefObject<T | null> {
  const ref = useRef<T | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return undefined
    const container = ref.current
    if (!container) return undefined

    // Remember the trigger so we can restore focus on close.
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    // Defer the initial focus to the next frame so the DOM is fully
    // mounted and any autoFocus inside the dialog has a chance to run
    // first.
    const raf = window.requestAnimationFrame(() => {
      const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        isFocusable,
      )
      const target = focusables[0] ?? container
      if (target instanceof HTMLElement) {
        target.focus()
      }
    })

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(isFocusable)
      if (focusables.length === 0) {
        // Nothing focusable — keep focus on the container itself.
        event.preventDefault()
        container.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (!first || !last) return
      const activeEl = document.activeElement
      if (event.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          event.preventDefault()
          last.focus()
        }
      } else {
        if (activeEl === last || !container.contains(activeEl)) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.cancelAnimationFrame(raf)
      document.removeEventListener('keydown', handleKeyDown)
      const prev = previouslyFocusedRef.current
      if (prev && document.contains(prev)) {
        // Restore focus on the trigger. Use `preventScroll` so the
        // page does not jump to the top if the trigger is offscreen.
        prev.focus({ preventScroll: true })
      }
      previouslyFocusedRef.current = null
    }
  }, [active])

  return ref
}

export default useFocusTrap
