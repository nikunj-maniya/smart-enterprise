import type { ComponentType } from 'react';
import type { FieldType } from '@se/shared';
import { CheckboxField } from './CheckboxField';
import { CheckboxGroupField } from './CheckboxGroupField';
import { DateField } from './DateField';
import { DateMultiField } from './DateMultiField';
import { DateRangeField } from './DateRangeField';
import { DateTimeField } from './DateTimeField';
import { MultiSelectField } from './MultiSelectField';
import { NumberField } from './NumberField';
import { ProjectPickerField } from './ProjectPickerField';
import { RadioField } from './RadioField';
import type { FieldComponentProps } from './shared';
import { SingleSelectField } from './SingleSelectField';
import { TextField } from './TextField';
import { TextareaField } from './TextareaField';
import { TimeField } from './TimeField';
import { UserPickerField } from './UserPickerField';

export type { FieldComponentProps } from './shared';
export {
  CheckboxField,
  CheckboxGroupField,
  DateField,
  DateMultiField,
  DateRangeField,
  DateTimeField,
  MultiSelectField,
  NumberField,
  ProjectPickerField,
  RadioField,
  SingleSelectField,
  TextField,
  TextareaField,
  TimeField,
  UserPickerField,
};

/**
 * Type → component registry (PRD §6.3). Covers the value-bearing field types
 * wired in this slice; `signature`/`file-upload`/`consent-link`/`section`/`group`
 * are stub or layout-only types handled elsewhere (see `isStubField`/`isLayoutField`
 * in `@se/shared`) — not present in this registry.
 */
export const FIELD_COMPONENTS: Partial<Record<FieldType, ComponentType<FieldComponentProps>>> = {
  text: TextField,
  textarea: TextareaField,
  number: NumberField,
  date: DateField,
  'date-multi': DateMultiField,
  datetime: DateTimeField,
  time: TimeField,
  daterange: DateRangeField,
  'single-select': SingleSelectField,
  'multi-select': MultiSelectField,
  radio: RadioField,
  checkbox: CheckboxField,
  'checkbox-group': CheckboxGroupField,
  'user-picker': UserPickerField,
  'project-picker': ProjectPickerField,
};
