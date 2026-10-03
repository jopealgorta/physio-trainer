import { useCallback, useEffect, useRef, useState } from "react";

export const AUTOSAVE_DELAY_MS = 800;
export type AutosaveStatus = "idle" | "saving" | "saved" | "error";
type Result<T, E extends string> = { ok: true; data: T } | { ok: false; error: E };

/**
 * Debounced, serial autosave. `schedule` queues values (sent `delay` ms after the last call),
 * `flush` sends them now, `cancel` drops them, `retry` re-sends the failed values. Only one
 * request runs at a time; values queued meanwhile are sent when it settles (latest wins). Queued
 * values are also sent on unmount, fire-and-forget (`onSaved` still runs).
 */
export function useAutosave<V, T, E extends string>({
  save,
  onSaved,
  delay = AUTOSAVE_DELAY_MS,
}: {
  save: (values: V) => Promise<Result<T, E>>;
  onSaved: (data: T, values: V) => void;
  delay?: number;
}) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [error, setError] = useState<E | "generic" | null>(null);

  const queued = useRef<{ values: V } | undefined>(undefined);
  const lastFailed = useRef<{ values: V } | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const saveRef = useRef(save);
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    saveRef.current = save;
    onSavedRef.current = onSaved;
  });

  const run = useCallback(() => {
    if (inFlight.current || queued.current === undefined) return;
    inFlight.current = true;
    void (async () => {
      try {
        // Drain the queue: values queued while a request is in flight go out when it settles.
        while (queued.current !== undefined) {
          const { values } = queued.current;
          queued.current = undefined;
          if (mounted.current) setStatus("saving");
          let result: Result<T, E | "generic">;
          try {
            result = await saveRef.current(values);
          } catch {
            result = { ok: false, error: "generic" };
          }
          if (result.ok) {
            lastFailed.current = undefined;
            if (mounted.current) setError(null);
            try {
              onSavedRef.current(result.data, values);
            } catch (error) {
              // The values are stored: a failing caller must not stop the saves after it.
              console.error("Autosave onSaved failed", error);
            }
          } else {
            lastFailed.current = { values };
            if (mounted.current) setError(result.error);
          }
          if (queued.current === undefined && mounted.current) {
            setStatus(result.ok ? "saved" : "error");
          }
        }
      } finally {
        inFlight.current = false;
      }
    })();
  }, []);

  const clearTimer = useCallback(() => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  const schedule = useCallback(
    (values: V) => {
      queued.current = { values };
      clearTimer();
      timer.current = setTimeout(() => {
        timer.current = undefined;
        run();
      }, delay);
    },
    [clearTimer, delay, run],
  );

  const flush = useCallback(() => {
    clearTimer();
    run();
  }, [clearTimer, run]);

  /** Drops the queued values (they are not sent, not even on unmount). */
  const cancel = useCallback(() => {
    clearTimer();
    queued.current = undefined;
  }, [clearTimer]);

  const retry = useCallback(() => {
    queued.current ??= lastFailed.current;
    flush();
  }, [flush]);

  // Sends only what is queued, so StrictMode's mount/unmount/mount is a no-op.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimer();
      run();
    };
  }, [clearTimer, run]);

  return { status, error, schedule, flush, cancel, retry };
}
