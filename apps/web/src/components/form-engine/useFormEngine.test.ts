import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, renderHook } from '@testing-library/react';
import type { FormDefinition } from '@se/shared';
import { useFormEngine } from './useFormEngine';

const definition: FormDefinition = {
  id: 'def-1',
  key: 'leave',
  title: 'Leave',
  version: 1,
  renderer: 'core',
  status: 'published',
  sections: [
    {
      order: 0,
      title: 'Details',
      fields: [
        {
          key: 'mode',
          label: 'Mode',
          type: 'single-select',
          required: true,
          options: [
            { value: 'wfh', label: 'Work From Home' },
            { value: 'office', label: 'Office' },
          ],
        },
        {
          key: 'reason',
          label: 'Reason',
          type: 'text',
          required: true,
          visibilityRule: { v: 1, when: { field: 'mode', op: 'eq', value: 'wfh' } },
        },
      ],
    },
  ],
};

test('useFormEngine hides a conditional field until its visibility rule matches', () => {
  const { result } = renderHook(() => useFormEngine(definition));

  assert.equal(result.current.sections[0].fields.length, 1);
  assert.equal(result.current.sections[0].fields[0].key, 'mode');

  act(() => result.current.setValue('mode', 'wfh'));
  assert.deepEqual(
    result.current.sections[0].fields.map((f) => f.key),
    ['mode', 'reason'],
  );

  act(() => result.current.setValue('mode', 'office'));
  assert.deepEqual(
    result.current.sections[0].fields.map((f) => f.key),
    ['mode'],
  );
});

test('useFormEngine clears a field\'s value the moment it becomes hidden', () => {
  const { result } = renderHook(() => useFormEngine(definition));

  act(() => result.current.setValue('mode', 'wfh'));
  act(() => result.current.setValue('reason', 'Doctor appointment'));
  assert.equal(result.current.values.reason, 'Doctor appointment');

  act(() => result.current.setValue('mode', 'office'));
  assert.equal(result.current.values.reason, undefined);
});

test('useFormEngine.validate fails with a required-field error, then passes once filled', () => {
  const { result } = renderHook(() => useFormEngine(definition));

  let ok = true;
  act(() => {
    ok = result.current.validate();
  });
  assert.equal(ok, false);
  assert.ok(result.current.errors.mode?.length, 'expected a validation error on the required mode field');

  act(() => result.current.setValue('mode', 'office'));
  act(() => {
    ok = result.current.validate();
  });
  assert.equal(ok, true);
  assert.deepEqual(result.current.errors, {});
});
