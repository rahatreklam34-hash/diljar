import { useEffect, RefObject } from 'react';

// Modal/panel icinde klavye gezinmesi: TAB dongusunu kapsar (focus trap),
// acilista ilk (veya tercih edilen) ogeye odaklanir, kapaninca onceki odaga doner.
// ESC ilgili bilesenin kendi handler'inda ele alinir.

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((el) => el.offsetParent !== null || el === document.activeElement);
}

export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement>,
  options?: { initialFocusRef?: RefObject<HTMLElement> }
) {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;
    const prevFocused = document.activeElement as HTMLElement | null;

    // Acilista odakla (modal boyanmasi icin kucuk gecikme)
    const t = window.setTimeout(() => {
      const cur = containerRef.current;
      if (!cur) return;
      const pref = options?.initialFocusRef?.current;
      if (pref) { pref.focus(); return; }
      const els = getFocusable(cur);
      if (els.length) els[0].focus();
      else cur.focus?.();
    }, 30);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const cur = containerRef.current;
      if (!cur) return;
      const els = getFocusable(cur);
      if (!els.length) { e.preventDefault(); return; }
      const first = els[0];
      const last = els[els.length - 1];
      const activeEl = document.activeElement as HTMLElement;
      // Odak konteyner disindaysa iceri al
      if (!cur.contains(activeEl)) { e.preventDefault(); first.focus(); return; }
      if (e.shiftKey && activeEl === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && activeEl === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKeyDown, true);
      // Onceki odaga geri don (hala DOM'daysa)
      if (prevFocused && document.body.contains(prevFocused)) {
        try { prevFocused.focus(); } catch { /* noop */ }
      }
    };
  }, [active]);
}
