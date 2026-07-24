import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { FormDefinition } from './metadata.js';
import { clearCompileCache, compileDefinition, validatePayload } from './compile.js';

/**
 * `leaveFormFixture` (fixtures.test.ts) already exercises the core per-field flow — hidden⇒absent,
 * conditional requiredness, type mismatch, option-membership violation — via `single-select`/
 * `number`/`user-picker` fields. This suite instead covers the field-type mappings and
 * compile-caching behavior that fixture doesn't touch: checkbox, consent-link, date-multi,
 * daterange, checkbox-group, radio, project-picker, stub fields, layout fields, the cross-field
 * dateOrder check, and `compileDefinition`/`clearCompileCache` themselves.
 */

function def(): FormDefinition {
  return {
    id: 'def_it_v1',
    key: 'it',
    title: 'IT Request',
    version: 1,
    renderer: 'core',
    status: 'published',
    sections: [
      {
        order: 0,
        title: 'Details',
        fields: [
          { key: 'access_type', label: 'Access Type', type: 'radio', required: true, options: [{ value: 'Software', label: 'Software' }, { value: 'Hardware', label: 'Hardware' }] },
          { key: 'will_come_next_days', label: 'Recurring?', type: 'checkbox', required: false },
          { key: 'consent', label: 'Consent', type: 'consent-link', required: true },
          { key: 'half_day_dates', label: 'Half-day dates', type: 'date-multi', required: false },
          { key: 'stay_range', label: 'Stay range', type: 'daterange', required: false, validation: { dateOrder: true } },
          {
            key: 'items',
            label: 'Items',
            type: 'checkbox-group',
            required: true,
            options: [{ value: 'Laptop', label: 'Laptop' }, { value: 'Mouse', label: 'Mouse' }],
          },
          { key: 'approvers', label: 'Approvers', type: 'project-picker', required: false, options: { multi: true } },
          { key: 'signature', label: 'Signature', type: 'signature', required: true },
          { key: 'start_date', label: 'Start date', type: 'date', required: false },
          { key: 'end_date', label: 'End date', type: 'date', required: false, validation: { dateOrder: { afterField: 'start_date' } } },
          { key: 'notes', label: 'Notes', type: 'section', required: false },
        ],
      },
    ],
  } as FormDefinition;
}

describe('validatePayload field-type mappings', () => {
  const base = {
    access_type: 'Software',
    consent: true,
    items: ['Laptop'],
    signature: 'data:image/png;base64,AAAA',
  };

  it('accepts a fully valid payload across every field type', () => {
    const result = validatePayload(def(), {
      ...base,
      will_come_next_days: true,
      half_day_dates: ['2026-06-02'],
      stay_range: { start: '2026-06-01', end: '2026-06-05' },
      approvers: ['p1', 'p2'],
    });
    assert.equal(result.success, true, JSON.stringify(result.errors));
  });

  it('rejects a checkbox given a non-boolean value', () => {
    const result = validatePayload(def(), { ...base, will_come_next_days: 'yes' });
    assert.equal(result.success, false);
    assert.ok(result.errors?.will_come_next_days);
  });

  it('requires consent-link to be exactly `true`, not just present', () => {
    const result = validatePayload(def(), { ...base, consent: false });
    assert.equal(result.success, false);
    assert.ok(result.errors?.consent);
  });

  it('rejects a date-multi entry that is an empty string', () => {
    const result = validatePayload(def(), { ...base, half_day_dates: [''] });
    assert.equal(result.success, false);
    assert.ok(result.errors?.half_day_dates);
  });

  it('rejects a daterange whose end is before its start (dateOrder: true)', () => {
    const result = validatePayload(def(), { ...base, stay_range: { start: '2026-06-05', end: '2026-06-01' } });
    assert.equal(result.success, false);
    assert.ok(result.errors?.stay_range);
  });

  it('rejects a checkbox-group value outside its option list', () => {
    const result = validatePayload(def(), { ...base, items: ['Unlisted Item'] });
    assert.equal(result.success, false);
    assert.ok(result.errors?.items);
  });

  it('shapes a multi project-picker as a string array', () => {
    const result = validatePayload(def(), { ...base, approvers: ['p1'] });
    assert.equal(result.success, true, JSON.stringify(result.errors));
    assert.deepEqual(result.data?.approvers, ['p1']);
  });

  it('never requires a stub field (signature) even though it is marked required', () => {
    const { signature: _drop, ...withoutSignature } = base;
    const result = validatePayload(def(), withoutSignature);
    assert.equal(result.success, true, JSON.stringify(result.errors));
  });

  it('skips a layout field ("section") entirely — no schema, never required', () => {
    const result = validatePayload(def(), base);
    assert.equal(result.success, true, JSON.stringify(result.errors));
    assert.equal(result.data?.notes, undefined);
  });
});

describe('validatePayload cross-field dateOrder check', () => {
  const base = {
    access_type: 'Software',
    consent: true,
    items: ['Laptop'],
    signature: 'x',
  };

  it('rejects when end_date is before start_date', () => {
    const result = validatePayload(def(), { ...base, start_date: '2026-06-10', end_date: '2026-06-01' });
    assert.equal(result.success, false);
    assert.ok(result.errors?.end_date);
  });

  it('accepts when end_date is on or after start_date', () => {
    const result = validatePayload(def(), { ...base, start_date: '2026-06-01', end_date: '2026-06-01' });
    assert.equal(result.success, true, JSON.stringify(result.errors));
  });

  it('skips the check when either side of the comparison is unanswered', () => {
    const result = validatePayload(def(), { ...base, end_date: '2026-06-01' });
    assert.equal(result.success, true, JSON.stringify(result.errors));
  });
});

describe('compileDefinition / clearCompileCache', () => {
  it('compiles one CompiledField per section field, in order', () => {
    const compiled = compileDefinition(def());
    assert.equal(compiled.fields.length, 11);
    assert.deepEqual(compiled.fields.map((f) => f.field.key)[0], 'access_type');
  });

  it('returns the same cached instance for an unchanged definition', () => {
    clearCompileCache();
    const first = compileDefinition(def());
    const second = compileDefinition(def());
    assert.equal(first, second);
  });

  it('recompiles when a field option set changes, even at the same version', () => {
    clearCompileCache();
    const v1 = def();
    const first = compileDefinition(v1);
    const v2 = def();
    (v2.sections[0].fields[5] as { options: unknown }).options = [{ value: 'Laptop', label: 'Laptop' }];
    const second = compileDefinition(v2);
    assert.notEqual(first, second);
  });

  it('clearCompileCache forces a fresh compile even for an unchanged definition', () => {
    const d = def();
    const first = compileDefinition(d);
    clearCompileCache();
    const second = compileDefinition(d);
    assert.notEqual(first, second);
  });
});
