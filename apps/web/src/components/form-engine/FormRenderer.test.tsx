import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FormField } from '@se/shared';
import type { VisibleSection } from './useFormEngine';
import { FormRenderer } from './FormRenderer';

afterEach(cleanup);

function section(key: number, title: string, fields: FormField[]): VisibleSection {
  return { key, section: { order: key, title, fields }, fields };
}

test('renders each visible section with its title and fields', () => {
  const reason: FormField = { key: 'reason', label: 'Reason', type: 'text', required: false };
  render(
    <FormRenderer sections={[section(0, 'Details', [reason])]} values={{}} errors={{}} onChange={() => {}} />,
  );
  assert.ok(screen.getByText('Details'));
  assert.ok(screen.getByText('Reason'));
});

test('skips layout-only fields (section/group) — they carry no value to render', () => {
  const layout: FormField = { key: 'grp', label: 'Group', type: 'group', required: false };
  const reason: FormField = { key: 'reason', label: 'Reason', type: 'text', required: false };
  render(
    <FormRenderer sections={[section(0, 'Details', [layout, reason])]} values={{}} errors={{}} onChange={() => {}} />,
  );
  assert.equal(screen.queryByText('Group'), null);
  assert.ok(screen.getByText('Reason'));
});

test('renders a stub field (file-upload) as a disabled "not yet supported" box', () => {
  const upload: FormField = { key: 'attachment', label: 'Attachment', type: 'file-upload', required: false };
  render(
    <FormRenderer sections={[section(0, 'Details', [upload])]} values={{}} errors={{}} onChange={() => {}} />,
  );
  assert.ok(screen.getByText('Attachment'));
  assert.ok(screen.getByText('Not yet supported'));
  assert.ok(screen.getByText('Available in a later release.'));
});

test('a stub field keeps its own helpText over the default fallback copy', () => {
  const signature: FormField = {
    key: 'sign',
    label: 'Signature',
    type: 'signature',
    required: false,
    helpText: 'Sign after review',
  };
  render(
    <FormRenderer sections={[section(0, 'Details', [signature])]} values={{}} errors={{}} onChange={() => {}} />,
  );
  assert.ok(screen.getByText('Sign after review'));
  assert.equal(screen.queryByText('Available in a later release.'), null);
});

test('gives a full-width column span to full-width field types only', () => {
  const notes: FormField = { key: 'notes', label: 'Notes', type: 'textarea', required: false };
  const reason: FormField = { key: 'reason', label: 'Reason', type: 'text', required: false };
  render(
    <FormRenderer sections={[section(0, 'Details', [notes, reason])]} values={{}} errors={{}} onChange={() => {}} />,
  );
  const notesWrapper = screen.getByText('Notes').closest('label')?.parentElement?.parentElement;
  const reasonWrapper = screen.getByText('Reason').closest('label')?.parentElement?.parentElement;
  assert.ok(notesWrapper?.className.includes('col-span-2'));
  assert.equal(reasonWrapper?.className.includes('col-span-2'), false);
});

test('renders consent-link as a checkbox and reports its value like one', () => {
  let lastValue: unknown;
  const consent: FormField = { key: 'agree', label: 'I agree', type: 'consent-link', required: true };
  render(
    <FormRenderer
      sections={[section(0, 'Details', [consent])]}
      values={{}}
      errors={{}}
      onChange={(key, value) => {
        lastValue = { key, value };
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /I agree/ }));
  assert.deepEqual(lastValue, { key: 'agree', value: true });
});

test('passes the field error and disabled state through to the rendered control', () => {
  const reason: FormField = { key: 'reason', label: 'Reason', type: 'text', required: true };
  render(
    <FormRenderer
      sections={[section(0, 'Details', [reason])]}
      values={{}}
      errors={{ reason: ['Reason is required'] }}
      onChange={() => {}}
      disabled
    />,
  );
  assert.ok(screen.getByText('Reason is required'));
  const input = screen.getByRole('textbox') as HTMLInputElement;
  assert.equal(input.disabled, true);
});
