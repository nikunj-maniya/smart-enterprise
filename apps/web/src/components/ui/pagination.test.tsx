import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PaginationBar } from './pagination';

afterEach(cleanup);

test('PaginationBar renders nothing while everything fits on one page', () => {
  render(<PaginationBar page={1} pageSize={20} total={20} onPageChange={() => {}} />);
  assert.equal(screen.queryByRole('navigation', { name: 'Pagination' }), null);
});

test('PaginationBar shows the visible range and total', () => {
  render(<PaginationBar page={2} pageSize={20} total={45} onPageChange={() => {}} />);
  assert.ok(screen.getByRole('navigation', { name: 'Pagination' }));
  assert.ok(screen.getByText('Showing 21–40 of 45'));
});

test('PaginationBar clips the final page range to the total', () => {
  render(<PaginationBar page={3} pageSize={20} total={45} onPageChange={() => {}} />);
  assert.ok(screen.getByText('Showing 41–45 of 45'));
});

test('PaginationBar disables Prev on the first page and Next on the last', () => {
  render(<PaginationBar page={1} pageSize={20} total={45} onPageChange={() => {}} />);
  assert.ok((screen.getByRole('button', { name: 'Prev' }) as HTMLButtonElement).disabled);
  assert.ok(!(screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled);
  cleanup();
  render(<PaginationBar page={3} pageSize={20} total={45} onPageChange={() => {}} />);
  assert.ok(!(screen.getByRole('button', { name: 'Prev' }) as HTMLButtonElement).disabled);
  assert.ok((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled);
});

test('PaginationBar asks for the adjacent page, not an absolute jump', () => {
  const asked: number[] = [];
  render(<PaginationBar page={2} pageSize={20} total={45} onPageChange={(p) => asked.push(p)} />);
  fireEvent.click(screen.getByRole('button', { name: 'Prev' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  assert.deepEqual(asked, [1, 3]);
});
