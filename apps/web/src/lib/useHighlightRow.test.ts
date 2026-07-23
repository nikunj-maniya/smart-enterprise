import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderHook } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { useHighlightRow, highlightRingClass } from './useHighlightRow';

function wrapper(initialEntries: string[]) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(MemoryRouter, { initialEntries }, children);
  };
}

test('useHighlightRow captures the ?highlight= param once on mount', () => {
  const { result } = renderHook(() => useHighlightRow(), {
    wrapper: wrapper(['/requests?highlight=req-42']),
  });
  assert.equal(result.current.highlightId, 'req-42');
});

test('useHighlightRow returns null when there is no highlight param', () => {
  const { result } = renderHook(() => useHighlightRow(), { wrapper: wrapper(['/requests']) });
  assert.equal(result.current.highlightId, null);
});

test('useHighlightRow strips the highlight param from the URL after mount', () => {
  function useCombined() {
    const highlight = useHighlightRow();
    const [searchParams] = useSearchParams();
    return { ...highlight, searchParams };
  }
  const { result } = renderHook(() => useCombined(), {
    wrapper: wrapper(['/requests?highlight=req-42&status=Pending']),
  });
  assert.equal(result.current.highlightId, 'req-42');
  assert.equal(result.current.searchParams.get('highlight'), null);
  assert.equal(result.current.searchParams.get('status'), 'Pending');
});

test('highlightRingClass returns the ring classes only for the matching row id', () => {
  assert.equal(highlightRingClass('req-1', 'req-1'), 'ring-2 ring-brand ring-offset-2');
  assert.equal(highlightRingClass('req-2', 'req-1'), '');
  assert.equal(highlightRingClass('req-1', null), '');
});

test('useHighlightRow.rowRef scrolls the matched element into view', () => {
  const { result } = renderHook(() => useHighlightRow(), { wrapper: wrapper(['/requests']) });
  let called: { block?: ScrollLogicalPosition; behavior?: ScrollBehavior } | undefined;
  const el = document.createElement('div');
  el.scrollIntoView = (opts?: boolean | ScrollIntoViewOptions) => {
    called = opts as { block?: ScrollLogicalPosition; behavior?: ScrollBehavior };
  };
  result.current.rowRef(el);
  assert.deepEqual(called, { block: 'center', behavior: 'smooth' });
});
