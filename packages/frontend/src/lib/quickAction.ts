import { useEffect, useRef } from 'react';

// Global hizli islem (Ctrl+Space) komutlari icin ortak mekanizma.
// CommandPalette bir komuta basildiginda fireQuickAction ile localStorage'a
// bekleyen aksiyonu yazar ve ilgili sayfaya navigate eder.
// Hedef sayfa useQuickAction ile bu aksiyonu tuketir ve modali acar.
// - Farkli sayfadan gelindiyse: sayfa mount olunca consume() calisir.
// - Ayni sayfadaysa (navigate no-op): 'quick-action' event'i ile consume() calisir.

export function fireQuickAction(key: string, payload: Record<string, any> = {}) {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* noop */
  }
  // Navigasyonun hedef sayfayi mount etmesine firsat ver, sonra haber ver.
  setTimeout(() => {
    try {
      window.dispatchEvent(new CustomEvent('quick-action', { detail: { key } }));
    } catch {
      /* noop */
    }
  }, 80);
}

export function useQuickAction(key: string, handler: (payload: any) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const consume = () => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        localStorage.removeItem(key);
        handlerRef.current(JSON.parse(raw) || {});
      } catch {
        /* noop */
      }
    };
    // Mount aninda (baska sayfadan navigate edildiyse) tuket.
    consume();
    const onEvt = (e: Event) => {
      const det = (e as CustomEvent).detail;
      if (!det || det.key === key) consume();
    };
    window.addEventListener('quick-action', onEvt);
    return () => window.removeEventListener('quick-action', onEvt);
  }, [key]);
}
