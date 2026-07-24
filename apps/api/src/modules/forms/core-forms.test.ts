import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseDefinition, type FormSection } from '@se/shared';
import { CORE_FORMS, HARDWARE_ITEMS, SOFTWARE_ITEMS } from './core-forms.js';

/**
 * `core-forms.ts` is pure data (no Prisma/service calls), so this suite checks its own
 * invariants directly rather than using the controller `invoke()` pattern. Definitions are
 * parsed the same way `forms.service.ts`'s `publishDefinition` wraps them before validating,
 * so a broken field type here fails the same way it would at publish time.
 */

function parseAsPublished(form: (typeof CORE_FORMS)[number]) {
  return parseDefinition({
    id: 'pending',
    key: form.key,
    title: form.title,
    version: 1,
    renderer: 'core',
    status: 'published',
    sections: form.sections,
  });
}

describe('SOFTWARE_ITEMS / HARDWARE_ITEMS', () => {
  it('are both non-empty lists of unique, non-blank strings', () => {
    for (const items of [SOFTWARE_ITEMS, HARDWARE_ITEMS]) {
      assert.ok(items.length > 0);
      assert.equal(new Set(items).size, items.length);
      assert.ok(items.every((item) => typeof item === 'string' && item.trim().length > 0));
    }
  });
});

describe('CORE_FORMS', () => {
  it('contains exactly the four core forms, in seed order', () => {
    assert.deepEqual(
      CORE_FORMS.map((f) => f.key),
      ['leave', 'wfh', 'visitor', 'it'],
    );
  });

  for (const form of CORE_FORMS) {
    it(`"${form.key}" parses cleanly via the shared engine's parseDefinition`, () => {
      assert.doesNotThrow(() => parseAsPublished(form));
    });
  }

  it('the IT form sources its software/hardware checkbox groups from the item catalog', () => {
    const it_ = CORE_FORMS.find((f) => f.key === 'it')!;
    const sections = it_.sections as FormSection[];
    const swField = sections.flatMap((s) => s.fields).find((f) => f.key === 'software_items')!;
    const hwField = sections.flatMap((s) => s.fields).find((f) => f.key === 'hardware_items')!;
    assert.deepEqual(swField.options, { source: 'item-catalog:software' });
    assert.deepEqual(hwField.options, { source: 'item-catalog:hardware' });
  });
});
