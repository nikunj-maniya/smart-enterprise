import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FormDefinitionDto } from '@se/shared';
import { definitionFromDto } from './definition';

const dto: FormDefinitionDto = {
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
      visibilityRule: null,
      fields: [
        {
          key: 'mode',
          label: 'Mode',
          type: 'single-select',
          required: true,
          options: [{ value: 'wfh', label: 'Work From Home' }],
          validation: null,
          visibilityRule: null,
        },
      ],
    },
  ],
  approvalWorkflow: null,
  statusModel: null,
};

test('definitionFromDto keeps the top-level identity and section/field shape', () => {
  const definition = definitionFromDto(dto);
  assert.equal(definition.id, 'def-1');
  assert.equal(definition.key, 'leave');
  assert.equal(definition.sections.length, 1);
  assert.equal(definition.sections[0].fields[0].key, 'mode');
  assert.deepEqual(definition.sections[0].fields[0].options, [{ value: 'wfh', label: 'Work From Home' }]);
});

test('definitionFromDto maps null options/validation/visibilityRule to undefined', () => {
  const definition = definitionFromDto(dto);
  assert.equal(definition.sections[0].visibilityRule, undefined);
  assert.equal(definition.sections[0].fields[0].validation, undefined);
  assert.equal(definition.sections[0].fields[0].visibilityRule, undefined);
});

test('definitionFromDto drops server-only approval/status metadata', () => {
  const definition = definitionFromDto(dto) as unknown as Record<string, unknown>;
  assert.equal('approvalWorkflow' in definition, false);
  assert.equal('statusModel' in definition, false);
});
