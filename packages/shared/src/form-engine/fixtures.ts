import type { FormDefinition } from './metadata.js';
import type { VisibilityRule } from './rules.js';

// ── Shared fixtures (Task 1.3) ────────────────────────────────
// Imported by BOTH the renderer and the server so a single set of payloads
// proves the two evaluate the SAME rules to the SAME outcome.

/** "Show HR Head when away duration > 2 days" — PRD §7.1 conditional. */
export const hrHeadVisibilityRule: VisibilityRule = {
  v: 1,
  when: { field: 'awayDuration', op: 'gt', value: 2 },
};

/** A minimal Leave-like definition exercising conditional visibility + requiredness. */
export const leaveFormFixture: FormDefinition = {
  id: 'def_leave_v1',
  key: 'leave',
  title: 'Leave Request',
  version: 1,
  renderer: 'core',
  status: 'published',
  sections: [
    {
      order: 0,
      title: 'Leave Details',
      fields: [
        { key: 'fullName', label: 'Full Name', type: 'text', required: true },
        {
          key: 'leaveType',
          label: 'Type of leave',
          type: 'single-select',
          required: true,
          options: [
            { value: 'available', label: 'Leaves available' },
            { value: 'lwp', label: 'LWP' },
            { value: 'marriage', label: 'Getting married' },
          ],
        },
        {
          key: 'awayDuration',
          label: 'Number of days away',
          type: 'number',
          required: true,
          validation: { min: 1 },
        },
        {
          key: 'hrHead',
          label: 'HR discussed with',
          type: 'user-picker',
          required: true,
          options: { multi: false, roles: ['hr-head'] },
          visibilityRule: hrHeadVisibilityRule,
        },
      ],
    },
  ],
};

export interface PayloadFixture {
  name: string;
  payload: Record<string, unknown>;
  expectValid: boolean;
  /** Field keys expected to carry an error (only when `expectValid` is false). */
  expectErrorFields?: string[];
}

export const leavePayloadFixtures: PayloadFixture[] = [
  {
    name: 'valid — short leave, HR Head hidden and absent',
    payload: { fullName: 'Asha', leaveType: 'available', awayDuration: 1 },
    expectValid: true,
  },
  {
    name: 'valid — long leave with required HR Head supplied',
    payload: { fullName: 'Asha', leaveType: 'lwp', awayDuration: 3, hrHead: 'user_7' },
    expectValid: true,
  },
  {
    name: 'rejected — hidden field carries a value (hidden⇒absent)',
    payload: { fullName: 'Asha', leaveType: 'available', awayDuration: 1, hrHead: 'user_7' },
    expectValid: false,
    expectErrorFields: ['hrHead'],
  },
  {
    name: 'rejected — conditionally-required visible field missing',
    payload: { fullName: 'Asha', leaveType: 'available', awayDuration: 3 },
    expectValid: false,
    expectErrorFields: ['hrHead'],
  },
  {
    name: 'rejected — type mismatch (number field given a string)',
    payload: { fullName: 'Asha', leaveType: 'available', awayDuration: 'three' },
    expectValid: false,
    expectErrorFields: ['awayDuration'],
  },
  {
    name: 'rejected — option-membership violation',
    payload: { fullName: 'Asha', leaveType: 'vacation', awayDuration: 1 },
    expectValid: false,
    expectErrorFields: ['leaveType'],
  },
];
