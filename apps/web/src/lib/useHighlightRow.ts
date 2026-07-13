import * as React from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Global search deep-links (`?highlight=<id>`) land on a list page with the matching row
 * scrolled into view and briefly flashed — reused across every list screen search can route to.
 * Reads the param once on mount; a callback ref on the matching row does the scroll.
 */
export function useHighlightRow(): {
  highlightId: string | null;
  rowRef: (el: HTMLElement | null) => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const [highlightId] = React.useState(() => searchParams.get('highlight'));

  // Runs once on mount only — `highlightId` is itself captured once via useState above.
  React.useEffect(() => {
    if (!highlightId) return;
    const next = new URLSearchParams(searchParams);
    next.delete('highlight');
    setSearchParams(next, { replace: true });
  }, []);

  const rowRef = React.useCallback((el: HTMLElement | null) => {
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

  return { highlightId, rowRef };
}

/** Ring-highlight class for the row matching `highlightId`, else empty. */
export function highlightRingClass(id: string, highlightId: string | null): string {
  return id === highlightId ? 'ring-2 ring-brand ring-offset-2' : '';
}
