import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CheckboxField,
  CheckboxGroupField,
  NumberField,
  RadioField,
  SingleSelectField,
  TextField,
  TextareaField,
  TimeField,
  FIELD_COMPONENTS,
} from './index';

test('FIELD_COMPONENTS maps each wired field type to its component', () => {
  assert.equal(FIELD_COMPONENTS.text, TextField);
  assert.equal(FIELD_COMPONENTS.textarea, TextareaField);
  assert.equal(FIELD_COMPONENTS.number, NumberField);
  assert.equal(FIELD_COMPONENTS.time, TimeField);
  assert.equal(FIELD_COMPONENTS['single-select'], SingleSelectField);
  assert.equal(FIELD_COMPONENTS.radio, RadioField);
  assert.equal(FIELD_COMPONENTS.checkbox, CheckboxField);
  assert.equal(FIELD_COMPONENTS['checkbox-group'], CheckboxGroupField);
});

test('FIELD_COMPONENTS has no entry for stub or layout-only field types', () => {
  assert.equal(FIELD_COMPONENTS.signature, undefined);
  assert.equal(FIELD_COMPONENTS['file-upload'], undefined);
  assert.equal(FIELD_COMPONENTS['consent-link'], undefined);
  assert.equal(FIELD_COMPONENTS.section, undefined);
  assert.equal(FIELD_COMPONENTS.group, undefined);
});
