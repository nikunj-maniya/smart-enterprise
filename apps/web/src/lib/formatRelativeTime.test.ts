import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRelativeTime } from './formatRelativeTime';

function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

test('formatRelativeTime returns "just now" for a timestamp under a minute old', () => {
  assert.equal(formatRelativeTime(isoAgo(0)), 'just now');
  assert.equal(formatRelativeTime(isoAgo(59_000)), 'just now');
});

test('formatRelativeTime switches to minutes at the 60-second boundary', () => {
  assert.equal(formatRelativeTime(isoAgo(60_000)), '1 min ago');
  assert.equal(formatRelativeTime(isoAgo(59 * 60_000)), '59 min ago');
});

test('formatRelativeTime switches to hours at the 60-minute boundary', () => {
  assert.equal(formatRelativeTime(isoAgo(60 * 60_000)), '1 hr ago');
  assert.equal(formatRelativeTime(isoAgo(23 * 60 * 60_000)), '23 hr ago');
});

test('formatRelativeTime switches to days at the 24-hour boundary and pluralizes', () => {
  assert.equal(formatRelativeTime(isoAgo(24 * 60 * 60_000)), '1 day ago');
  assert.equal(formatRelativeTime(isoAgo(2 * 24 * 60 * 60_000)), '2 days ago');
  assert.equal(formatRelativeTime(isoAgo(6 * 24 * 60 * 60_000)), '6 days ago');
});

test('formatRelativeTime switches to weeks at the 7-day boundary and pluralizes', () => {
  assert.equal(formatRelativeTime(isoAgo(7 * 24 * 60 * 60_000)), '1 week ago');
  assert.equal(formatRelativeTime(isoAgo(4 * 7 * 24 * 60 * 60_000)), '4 weeks ago');
});

test('formatRelativeTime falls back to a locale date string at 5 weeks and beyond', () => {
  const iso = isoAgo(5 * 7 * 24 * 60 * 60_000);
  assert.equal(formatRelativeTime(iso), new Date(iso).toLocaleDateString());
});

test('formatRelativeTime clamps a future timestamp to "just now" instead of a negative duration', () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  assert.equal(formatRelativeTime(future), 'just now');
});
