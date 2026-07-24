import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { Placeholder } from './Placeholder';

afterEach(cleanup);

test('renders the given note', () => {
  render(<Placeholder note="Nothing here yet." />);
  assert.ok(screen.getByText('Nothing here yet.'));
});
