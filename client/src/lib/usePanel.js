// =============================================================================
// usePanel  -  every panel ends in ready, empty, error or forbidden.
// There is no code path that leaves a skeleton on screen forever.
// =============================================================================
import { useCallback, useEffect, useState } from 'react';
import { PANEL_TIMEOUT_MS } from '@todo/shared';

const isEmpty = (d) => d == null || (Array.isArray(d) && d.length === 0);

/**
 * @param fetcher  (signal) => Promise<data>
 * @param deps     re-runs when these change
 */
export function usePanel(fetcher, deps = [], { timeoutMs = PANEL_TIMEOUT_MS, allowEmpty = false } = {}) {
  const [state, setState] = useState({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
    let live = true;
    setState({ status: 'loading' });

    Promise.resolve(fetcher(controller.signal))
      .then((data) => {
        if (!live) return;
        if (!allowEmpty && isEmpty(data)) setState({ status: 'empty', data });
        else setState({ status: 'ready', data });
      })
      .catch((err) => {
        if (!live || controller.signal.reason === 'unmount') return;
        if (err.status === 403) {
          setState({ status: 'forbidden', message: err.message });
          return;
        }
        setState({
          status: 'error',
          message: controller.signal.reason === 'timeout'
            ? 'This is taking too long. The server may be down.'
            : err.message || 'Something went wrong.',
          requestId: err.requestId,
        });
      })
      .finally(() => clearTimeout(timer));

    return () => {
      live = false;
      clearTimeout(timer);
      controller.abort('unmount');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  /** Update the panel's data in place after a write, without a refetch flicker. */
  const patch = useCallback((updater) => {
    setState((prev) => (prev.status === 'ready' || prev.status === 'empty')
      ? { ...prev, status: 'ready', data: updater(prev.data) }
      : prev);
  }, []);

  return { ...state, retry, patch, reload: retry };
}
