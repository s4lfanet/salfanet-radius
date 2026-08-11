'use client';

import { useEffect, useRef, useCallback } from 'react';
import { signOut } from 'next-auth/react';

interface UseIdleTimeoutOptions {
  /** Timeout in milliseconds (default: 30 minutes) */
  timeout?: number;
  /** Warning time before logout in milliseconds (default: 1 minute) */
  warningTime?: number;
  /** Callback when warning is triggered */
  onWarning?: () => void;
  /** Callback when timeout is reached (before logout) */
  onTimeout?: () => void;
  /** Whether to enable the idle timeout */
  enabled?: boolean;
}

const DEFAULT_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const DEFAULT_WARNING_TIME = 60 * 1000; // 1 minute before logout

export function useIdleTimeout({
  timeout = DEFAULT_TIMEOUT,
  warningTime = DEFAULT_WARNING_TIME,
  onWarning,
  onTimeout,
  enabled = true,
}: UseIdleTimeoutOptions = {}) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const warningShownRef = useRef<boolean>(false);

  // Use refs so callbacks never appear in dependency arrays —
  // prevents the idle timer from resetting every time the parent re-renders
  // with a new inline function reference.
  const onWarningRef = useRef(onWarning);
  onWarningRef.current = onWarning;
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const clearTimeouts = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
  }, []);

  const handleLogout = useCallback(async () => {
    onTimeoutRef.current?.();
    // Clear session storage
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('idle_logout', 'true');
      // Use redirect: false to avoid NEXTAUTH_URL issues, then manual redirect
      await signOut({ redirect: false });
      window.location.href = `${window.location.origin}/admin/login?reason=idle`;
    } else {
      await signOut({ callbackUrl: '/admin/login?reason=idle' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable — uses onTimeoutRef

  const resetTimer = useCallback(() => {
    if (!enabled) return;

    lastActivityRef.current = Date.now();
    warningShownRef.current = false;
    clearTimeouts();

    // Set warning timeout
    warningTimeoutRef.current = setTimeout(() => {
      warningShownRef.current = true;
      onWarningRef.current?.();
    }, timeout - warningTime);

    // Set logout timeout
    timeoutRef.current = setTimeout(() => {
      handleLogout();
    }, timeout);
  // onWarning/onTimeout intentionally excluded — accessed via refs to keep timer stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, timeout, warningTime, handleLogout, clearTimeouts]);

  const extendSession = useCallback(() => {
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    if (!enabled) {
      clearTimeouts();
      return;
    }

    // Events that reset the idle timer
    const events = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click',
      'wheel',
    ];

    // Throttle function to prevent excessive timer resets
    let lastReset = 0;
    const throttleMs = 1000; // Only reset every 1 second max

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastReset >= throttleMs) {
        lastReset = now;
        resetTimer();
      }
    };

    // Add event listeners
    events.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Initial timer start
    resetTimer();

    // Cleanup
    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });
      clearTimeouts();
    };
  }, [enabled, resetTimer, clearTimeouts]);

  // Check if session expired on tab focus
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastActivityRef.current;
        if (elapsed >= timeout) {
          handleLogout();
        } else {
          resetTimer();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, timeout, handleLogout, resetTimer]);

  return {
    resetTimer,
    extendSession,
    isWarningShown: warningShownRef.current,
    lastActivity: lastActivityRef.current,
  };
}
