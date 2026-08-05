import { useEffect } from 'react';

/* ── Keep the focused field above the on-screen keyboard ──────────────────
   On phones the virtual keyboard slides up over the lower half of the screen
   and can cover the input the user just tapped. When a field gains focus we
   wait for the keyboard to finish animating in (the viewport resizes thanks
   to `interactive-widget=resizes-content` in index.html) and then scroll the
   field into the visible area. Works for every input/textarea/select on the
   page, so each auth screen only needs a single call.
─────────────────────────────────────────────────────────────────────────── */
export default function useAuthKeyboard() {
  useEffect(() => {
    const onFocusIn = (e) => {
      const el = e.target;
      if (!el || typeof el.matches !== 'function') return;
      if (!el.matches('input, textarea, select')) return;
      // Delay so the keyboard has resized the viewport before we scroll.
      setTimeout(() => {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 300);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);
}
