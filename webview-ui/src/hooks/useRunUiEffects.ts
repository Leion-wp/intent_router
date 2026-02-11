import { useEffect, useRef } from 'react';

type UseRunUiEffectsOptions = {
  runMenuOpen: boolean;
  setRunMenuOpen: (next: boolean) => void;
  connectionError: string | null;
  setConnectionError: (value: string | null) => void;
  runPillStatus: 'idle' | 'running' | 'success' | 'error';
  setRunPillStatus: (value: 'idle' | 'running' | 'success' | 'error') => void;
};

export function useRunUiEffects(options: UseRunUiEffectsOptions) {
  const {
    runMenuOpen,
    setRunMenuOpen,
    connectionError,
    setConnectionError,
    runPillStatus,
    setRunPillStatus
  } = options;
  const runPillResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const onGlobalClick = () => {
      if (runMenuOpen) setRunMenuOpen(false);
    };
    window.addEventListener('click', onGlobalClick);
    return () => window.removeEventListener('click', onGlobalClick);
  }, [runMenuOpen, setRunMenuOpen]);

  useEffect(() => {
    if (!connectionError) return;
    const timer = window.setTimeout(() => setConnectionError(null), 1800);
    return () => window.clearTimeout(timer);
  }, [connectionError, setConnectionError]);

  useEffect(() => {
    if (runPillResetTimerRef.current) {
      window.clearTimeout(runPillResetTimerRef.current);
      runPillResetTimerRef.current = null;
    }
    if (runPillStatus === 'success' || runPillStatus === 'error') {
      runPillResetTimerRef.current = window.setTimeout(() => {
        setRunPillStatus('idle');
      }, 1800);
    }
    return () => {
      if (runPillResetTimerRef.current) {
        window.clearTimeout(runPillResetTimerRef.current);
        runPillResetTimerRef.current = null;
      }
    };
  }, [runPillStatus, setRunPillStatus]);
}
