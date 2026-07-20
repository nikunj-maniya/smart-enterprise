import { SystemRoleKey, type PublishDefinitionInput } from '@se/shared';

// ── The four core form definitions (PRD §7/§8/§9) ─────────────
// Authored as `PublishDefinitionInput`s and seeded verbatim on tenant activation
// (see forms.seed.ts). Every definition must pass the shared `parseDefinition`.
// Conditional fields carry `{ v:1, when }` visibility rules keyed off other fields;
// approver sources live in `approvalWorkflow.stageRules` (consumed by a later slice).

/** value === label options for a radio / select. */
function opts(...values: string[]) {
  return values.map((value) => ({ value, label: value }));
}

// Exported so `item-catalog.seed.ts` can seed these as the tenant's default `ItemCatalog` rows —
// the IT form's item fields resolve their live options from that table, not from here (see
// their `options: { source: 'item-catalog:...' }` marker below).
export const SOFTWARE_ITEMS = [
  'Bitbucket',
  'Gitlab',
  'Github',
  'Jira',
  'Windows OS',
  'DbForge',
  'Adobe',
  'GSuite',
  'Drive Storage',
  'Canva',
  'Email group',
  'Ubuntu OS',
  'Skype',
];

export const HARDWARE_ITEMS = [
  'Laptop',
  'RAM',
  'Testing phone',
  'Mouse',
  'Monitor',
  'Keyboard',
  'Water bottle',
  'Fan',
  'Pendrive',
  'Hard disk',
  'Software',
  'Laptop charger',
  'Tablet/iPad',
  'Mobile data cable',
  'Desk',
  'Laptop connector',
  'Monitor cord',
  'HDMI/VGA cable',
  'STPI Access card',
  'ID card',
  'GIFT Access card',
  'Printer',
  'Smartphone',
  'Testing Laptop',
  'Apple Wristwatch',
  'Headphone',
  'Laptop Battery',
];

// ── Leave Request (PRD §7.1) ──────────────────────────────────
const leave: PublishDefinitionInput = {
  key: 'leave',
  title: 'Leave Request',
  sections: [
    {
      order: 0,
      title: 'Leave Details',
      fields: [
        { key: 'full_name', label: 'Full Name', type: 'text', required: true },
        {
          key: 'department',
          label: 'Group / Department',
          type: 'single-select',
          required: true,
          options: { source: 'departments' },
        },
        {
          key: 'project_name',
          label: 'Project name',
          type: 'project-picker',
          required: true,
          options: { multi: true },
        },
        {
          key: 'project_manager',
          label: 'Project Manager',
          type: 'user-picker',
          required: true,
          options: { multi: true, roles: [SystemRoleKey.ProjectManager] },
        },
        {
          key: 'tech_lead',
          label: 'Tech Lead',
          type: 'user-picker',
          required: true,
          options: { multi: true, source: 'project-tech-leads' },
        },
        { key: 'discussed_with', label: 'With whom did you discuss?', type: 'text', required: false },
        {
          key: 'away_duration',
          label: 'Are you going to be away for long?',
          type: 'radio',
          required: true,
          options: opts('≤2 days', '>2 days'),
        },
        {
          key: 'hr_discussed_with',
          label: 'HR discussed with',
          type: 'user-picker',
          required: true,
          options: { multi: false, roles: [SystemRoleKey.HrHead] },
          visibilityRule: { v: 1, when: { field: 'away_duration', op: 'eq', value: '>2 days' } },
        },
        {
          key: 'number_of_days',
          label: 'Number of days',
          type: 'number',
          required: true,
          validation: { min: 1 },
        },
        {
          key: 'when_go',
          label: 'When will you go?',
          type: 'radio',
          required: true,
          options: opts('Today', 'Tomorrow', 'Later'),
        },
        { key: 'start_date', label: 'Start date', type: 'date', required: true },
        {
          key: 'end_date',
          label: 'End date',
          type: 'date',
          required: true,
          validation: { dateOrder: { afterField: 'start_date' } },
        },
        {
          key: 'half_day_dates',
          label: 'Half-day dates',
          type: 'date-multi',
          required: false,
          helpText: 'Pick any dates within your leave range that are half-days.',
        },
        {
          key: 'leave_type',
          label: 'Type of leave',
          type: 'single-select',
          required: true,
          // Resolved server-side from the tenant's `LeaveType` rows at read/submit time (same
          // master-data pattern as the IT form's `item-catalog:*` sources below) — a Leave
          // Policy create/rename applies instantly with no republish. Option value/label is the
          // type NAME (`extractors.ts` stores the label into `Request.leaveTypeId`). See
          // `forms.service.ts`'s catalog resolution.
          options: { source: 'leave-types' },
        },
        { key: 'context', label: 'Context', type: 'textarea', required: true },
      ],
    },
  ],
  approvalWorkflow: {
    mode: 'parallel',
    stageRules: {
      approvers: [
        { source: 'field', field: 'project_manager' },
        { source: 'field', field: 'tech_lead' },
        {
          source: 'field',
          field: 'hr_discussed_with',
          when: { v: 1, when: { field: 'away_duration', op: 'eq', value: '>2 days' } },
        },
      ],
    },
  },
  // Starts directly in `Pending Approval` (leave-wfh-requests spec: "created in Pending
  // Approval") — `Draft`/`Submitted` were vestigial states nothing ever transitioned into
  // or out of automatically, leaving every submission stuck at `Draft` forever.
  statusModel: {
    states: ['Pending Approval', 'Approved', 'Rejected', 'Cancelled', 'Withdrawn', 'Completed'],
    transitions: [
      { from: 'Pending Approval', to: 'Approved', roles: [SystemRoleKey.ProjectManager, SystemRoleKey.TechLead, SystemRoleKey.HrHead] },
      { from: 'Pending Approval', to: 'Rejected', roles: [SystemRoleKey.ProjectManager, SystemRoleKey.TechLead, SystemRoleKey.HrHead] },
      { from: 'Pending Approval', to: 'Withdrawn', roles: ['requester'] },
      { from: 'Approved', to: 'Cancelled', roles: [SystemRoleKey.HrHead, SystemRoleKey.EnterpriseAdmin] },
      { from: 'Approved', to: 'Completed', roles: ['system'] },
    ],
  },
};

// ── Work From Home Request (PRD §7.2) ─────────────────────────
const wfh: PublishDefinitionInput = {
  key: 'wfh',
  title: 'Work From Home Request',
  sections: [
    {
      order: 0,
      title: 'Work From Home Details',
      fields: [
        { key: 'full_name', label: 'Full Name', type: 'text', required: true },
        {
          key: 'department',
          label: 'Group / Department',
          type: 'single-select',
          required: true,
          options: { source: 'departments' },
        },
        {
          key: 'project_name',
          label: 'Project name',
          type: 'project-picker',
          required: true,
          options: { multi: true },
        },
        {
          key: 'project_manager',
          label: 'Project Manager',
          type: 'user-picker',
          required: true,
          options: { multi: true, roles: [SystemRoleKey.ProjectManager] },
        },
        {
          key: 'tech_lead',
          label: 'Tech Lead',
          type: 'user-picker',
          required: true,
          options: { multi: true, source: 'project-tech-leads' },
        },
        { key: 'discussed_with', label: 'With whom did you discuss?', type: 'text', required: false },
        {
          key: 'duration',
          label: 'Duration of days',
          type: 'radio',
          required: true,
          options: opts('Up to 2 days', 'More than 2 days'),
        },
        {
          key: 'hr_discussed_with',
          label: 'HR Head discussed with',
          type: 'user-picker',
          required: true,
          options: { multi: false, roles: [SystemRoleKey.HrHead] },
          visibilityRule: { v: 1, when: { field: 'duration', op: 'eq', value: 'More than 2 days' } },
        },
        {
          key: 'when_go',
          label: 'When?',
          type: 'radio',
          required: true,
          options: opts('Today', 'Tomorrow', 'Later'),
        },
        {
          key: 'can_not_avoid',
          label: 'Can you not avoid this WFH?',
          type: 'radio',
          required: true,
          options: opts('Yes', 'No'),
        },
        {
          key: 'special_condition',
          label: 'Special condition?',
          type: 'radio',
          required: false,
          options: opts('Yes', 'No'),
        },
        { key: 'detailed_reason', label: 'Detailed reason', type: 'textarea', required: true },
        { key: 'start_date', label: 'Start date', type: 'date', required: true },
        {
          key: 'end_date',
          label: 'End date',
          type: 'date',
          required: true,
          validation: { dateOrder: { afterField: 'start_date' } },
        },
        {
          key: 'half_wfh_dates',
          label: 'Half-WFH dates',
          type: 'date-multi',
          required: false,
          helpText: 'Pick any dates within your WFH range that are half-days.',
        },
      ],
    },
  ],
  approvalWorkflow: {
    mode: 'parallel',
    stageRules: {
      approvers: [
        { source: 'field', field: 'project_manager' },
        { source: 'field', field: 'tech_lead' },
        {
          source: 'field',
          field: 'hr_discussed_with',
          when: { v: 1, when: { field: 'duration', op: 'eq', value: 'More than 2 days' } },
        },
      ],
    },
  },
  // Same fix as Leave's status model above — starts directly in `Pending Approval`.
  statusModel: {
    states: ['Pending Approval', 'Approved', 'Rejected', 'Cancelled', 'Withdrawn', 'Completed'],
    transitions: [
      { from: 'Pending Approval', to: 'Approved', roles: [SystemRoleKey.ProjectManager, SystemRoleKey.TechLead, SystemRoleKey.HrHead] },
      { from: 'Pending Approval', to: 'Rejected', roles: [SystemRoleKey.ProjectManager, SystemRoleKey.TechLead, SystemRoleKey.HrHead] },
      { from: 'Pending Approval', to: 'Withdrawn', roles: ['requester'] },
      { from: 'Approved', to: 'Cancelled', roles: [SystemRoleKey.HrHead, SystemRoleKey.EnterpriseAdmin] },
      { from: 'Approved', to: 'Completed', roles: ['system'] },
    ],
  },
};

// ── Visitor Registration (PRD §7.3) ───────────────────────────
const visitor: PublishDefinitionInput = {
  key: 'visitor',
  title: 'Visitor Registration',
  sections: [
    {
      order: 0,
      title: 'Visitor Details',
      fields: [
        { key: 'mobile', label: 'Mobile', type: 'text', required: true },
        { key: 'visitor_name', label: 'Visitor Name', type: 'text', required: true },
        {
          key: 'whom_to_meet',
          label: 'Whom to meet',
          type: 'user-picker',
          required: true,
          options: { multi: false },
        },
        { key: 'purpose', label: 'Purpose', type: 'textarea', required: true },
        { key: 'laptop_details', label: 'Laptop details', type: 'textarea', required: false },
        { key: 'other_device_details', label: 'Other device details', type: 'textarea', required: false },
        {
          key: 'process_head_approval',
          label: 'Process Head approval',
          type: 'user-picker',
          required: true,
          options: { multi: false, roles: [SystemRoleKey.ProcessHead] },
        },
        { key: 'will_come_next_days', label: 'Will come for next days', type: 'checkbox', required: false },
        {
          key: 'no_of_days',
          label: 'No. of days',
          type: 'number',
          required: false,
          validation: { min: 1 },
          visibilityRule: { v: 1, when: { field: 'will_come_next_days', op: 'eq', value: true } },
        },
        { key: 'visit_datetime', label: 'Date & time of visit', type: 'datetime', required: true },
        { key: 'out_time', label: 'Out time', type: 'time', required: true },
        { key: 'address', label: 'Address', type: 'textarea', required: false },
        { key: 'passport_number', label: 'Passport number', type: 'text', required: false },
        // Signature is deferred to a later phase (object storage) — rendered as a disabled stub.
        { key: 'signature', label: 'Signature', type: 'signature', required: false },
        { key: 'privacy_consent', label: 'Privacy policy consent', type: 'consent-link', required: true },
      ],
    },
  ],
  approvalWorkflow: {
    mode: 'parallel',
    stageRules: {
      approvers: [{ source: 'field', field: 'process_head_approval' }],
    },
  },
  statusModel: {
    states: [
      'Pre-Registered',
      'Pending Approval',
      'Approved',
      'Checked-In',
      'Checked-Out',
      'No-Show',
      'Cancelled',
    ],
    transitions: [
      { from: 'Pre-Registered', to: 'Pending Approval', roles: ['requester'] },
      { from: 'Pre-Registered', to: 'Cancelled', roles: ['requester'] },
      { from: 'Pending Approval', to: 'Approved', roles: [SystemRoleKey.ProcessHead] },
      { from: 'Pending Approval', to: 'Cancelled', roles: ['requester'] },
      { from: 'Approved', to: 'Checked-In', roles: [SystemRoleKey.EnterpriseAdmin, SystemRoleKey.HrHead] },
      { from: 'Approved', to: 'No-Show', roles: [SystemRoleKey.EnterpriseAdmin, SystemRoleKey.HrHead] },
      { from: 'Approved', to: 'Cancelled', roles: [SystemRoleKey.EnterpriseAdmin, SystemRoleKey.HrHead] },
      { from: 'Checked-In', to: 'Checked-Out', roles: [SystemRoleKey.EnterpriseAdmin, SystemRoleKey.HrHead] },
    ],
  },
};

// ── IT Change/Addition Request (PRD §7.4) ─────────────────────
const it: PublishDefinitionInput = {
  key: 'it',
  title: 'IT Change/Addition Request',
  sections: [
    {
      order: 0,
      title: 'Request Details',
      fields: [
        {
          key: 'access_type',
          label: 'Access Type',
          type: 'radio',
          required: true,
          options: opts('Software', 'Hardware'),
        },
        {
          key: 'process_head',
          label: 'Process Head approval',
          type: 'user-picker',
          required: true,
          options: { multi: false, roles: [SystemRoleKey.ProcessHead] },
        },
      ],
    },
    {
      order: 1,
      title: 'Software Request',
      visibilityRule: { v: 1, when: { field: 'access_type', op: 'eq', value: 'Software' } },
      fields: [
        {
          key: 'sw_request_type',
          label: 'Request type',
          type: 'radio',
          required: true,
          options: opts('Change of access', 'Removal of access', 'New access'),
        },
        {
          key: 'software_items',
          label: 'Software items',
          type: 'checkbox-group',
          required: true,
          // Resolved server-side from the tenant's `ItemCatalog` at read/submit time (design.md:
          // "master data, not form-field options") — never a static list, so an admin's catalog
          // edit applies instantly with no republish. See `forms.service.ts`'s catalog resolution.
          options: { source: 'item-catalog:software' },
        },
        {
          key: 'sw_impact',
          label: 'Impact',
          type: 'radio',
          required: true,
          options: opts('Blocker', 'Medium', 'Low'),
        },
        { key: 'sw_job_role', label: 'Job role', type: 'textarea', required: true },
        { key: 'sw_reason', label: 'Reason', type: 'textarea', required: true },
      ],
    },
    {
      order: 2,
      title: 'Hardware Request',
      visibilityRule: { v: 1, when: { field: 'access_type', op: 'eq', value: 'Hardware' } },
      fields: [
        {
          key: 'hw_request_type',
          label: 'Request type',
          type: 'radio',
          required: true,
          options: opts('Change of item', 'New item'),
        },
        {
          key: 'hardware_items',
          label: 'Hardware items',
          type: 'checkbox-group',
          required: true,
          options: { source: 'item-catalog:hardware' },
        },
        {
          key: 'hw_impact',
          label: 'Impact',
          type: 'radio',
          required: true,
          options: opts('Blocker', 'Medium', 'Low'),
        },
        { key: 'hw_job_role', label: 'Job role', type: 'textarea', required: true },
        { key: 'hw_reason', label: 'Reason', type: 'textarea', required: true },
      ],
    },
  ],
  approvalWorkflow: {
    mode: 'parallel',
    stageRules: {
      approvers: [{ source: 'field', field: 'process_head' }],
    },
  },
  statusModel: {
    states: [
      'Requested',
      'Pending Approval',
      'Approved',
      'In Progress',
      'Fulfilled',
      'Closed',
      'Rejected',
    ],
    transitions: [
      { from: 'Requested', to: 'Pending Approval', roles: ['requester'] },
      { from: 'Pending Approval', to: 'Approved', roles: [SystemRoleKey.ProcessHead] },
      { from: 'Pending Approval', to: 'Rejected', roles: [SystemRoleKey.ProcessHead] },
      { from: 'Approved', to: 'In Progress', roles: [SystemRoleKey.ItAdmin] },
      { from: 'In Progress', to: 'Fulfilled', roles: [SystemRoleKey.ItAdmin] },
      { from: 'Fulfilled', to: 'Closed', roles: [SystemRoleKey.ItAdmin] },
    ],
  },
};

/** The four core forms seeded for every tenant, in seed order. */
export const CORE_FORMS: PublishDefinitionInput[] = [leave, wfh, visitor, it];
