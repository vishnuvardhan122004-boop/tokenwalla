/**
 * useVisiblePolling
 * Runs `callback` every `intervalMs` ONLY when the tab is visible.
 * Pauses automatically on tab switch / phone lock screen.
 * Drop-in replacement for setInterval in MyBookings and BookingToken.
 *
 * Usage:
 *   useVisiblePolling(() => fetchBookings(true), 15000, hasActiveBookings);
 */
import { useEffect, useRef } from 'react';

export function useVisiblePolling(callback, intervalMs, enabled = true) {
  const timerRef    = useRef(null);
  const callbackRef = useRef(callback);

  // Keep ref current without resetting the interval
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }

    function start() {
      if (timerRef.current) return;
      timerRef.current = setInterval(() => {
        if (document.visibilityState === 'visible') {
          callbackRef.current();
        }
      }, intervalMs);
    }

    function stop() {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        start();
      } else {
        stop();
      }
    }

    // Start immediately if tab is already visible
    if (document.visibilityState === 'visible') {
      start();
    }

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [enabled, intervalMs]);
}