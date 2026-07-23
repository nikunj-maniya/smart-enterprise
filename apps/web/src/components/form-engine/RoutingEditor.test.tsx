import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import type { FormFieldDto, StageRules } from '@se/shared';
import { RoutingEditor } from './RoutingEditor';

afterEach(cleanup);

const approver: FormFieldDto = {
  key: 'approver',
  label: 'Approver',
  type: 'user-picker',
  required: true,
  options: null,
  validation: null,
  visibilityRule: null,
};
const project: FormFieldDto = {
  key: 'project',
  label: 'Project',
  type: 'project-picker',
  required: false,
  options: null,
  validation: null,
  visibilityRule: null,
};
const mode: FormFieldDto = {
  key: 'mode',
  label: 'Mode',
  type: 'single-select',
  required: true,
  options: null,
  validation: null,
  visibilityRule: null,
};

type Props = ComponentProps<typeof RoutingEditor>;

function renderEditor(overrides: Partial<Props> = {}) {
  let saved: StageRules | undefined;
  render(
    <RoutingEditor
      fields={[approver, project, mode]}
      stageRules={null}
      disabled={false}
      saving={false}
      error={null}
      onSave={(rules) => {
        saved = rules;
      }}
      {...overrides}
    />,
  );
  return { getSaved: () => saved };
}

test('prompts to add a picker field before routing can be configured', () => {
  render(
    <RoutingEditor fields={[mode]} stageRules={null} disabled={false} saving={false} error={null} onSave={() => {}} />,
  );
  assert.ok(screen.getByText('Add a user-picker or project-picker field to this form before configuring routing.'));
  assert.equal(screen.queryByRole('button', { name: /Add stage/ }), null);
});

test('adds a stage defaulting to the first picker field and saves it', () => {
  const { getSaved } = renderEditor();

  fireEvent.click(screen.getByRole('button', { name: /Add stage/ }));
  assert.equal((screen.getByLabelText('Approver field for stage 1') as HTMLSelectElement).value, 'approver');

  fireEvent.click(screen.getByRole('button', { name: /Save Routing/ }));

  assert.deepEqual(getSaved(), { approvers: [{ source: 'field', field: 'approver', when: undefined }] });
});

test('switches a stage to a different picker field', () => {
  const { getSaved } = renderEditor();
  fireEvent.click(screen.getByRole('button', { name: /Add stage/ }));

  fireEvent.change(screen.getByLabelText('Approver field for stage 1'), { target: { value: 'project' } });
  fireEvent.click(screen.getByRole('button', { name: /Save Routing/ }));

  assert.equal(getSaved()?.approvers[0].field, 'project');
});

test('removes a stage', () => {
  renderEditor();
  fireEvent.click(screen.getByRole('button', { name: /Add stage/ }));
  assert.ok(screen.getByLabelText('Approver field for stage 1'));

  fireEvent.click(screen.getByRole('button', { name: 'Remove stage 1' }));
  assert.equal(screen.queryByLabelText('Approver field for stage 1'), null);
});

test('adds a visibility gate to a stage and saves the condition', () => {
  const { getSaved } = renderEditor();
  fireEvent.click(screen.getByRole('button', { name: /Add stage/ }));
  fireEvent.click(screen.getByRole('button', { name: /Add visibility gate/ }));

  fireEvent.change(screen.getByLabelText('Gate field for stage 1'), { target: { value: 'mode' } });
  fireEvent.change(screen.getByLabelText('Gate value for stage 1'), { target: { value: 'wfh' } });
  fireEvent.click(screen.getByRole('button', { name: /Save Routing/ }));

  assert.deepEqual(getSaved()?.approvers[0].when, { v: 1, when: { field: 'mode', op: 'eq', value: 'wfh' } });
});

test('removes a stage visibility gate', () => {
  const { getSaved } = renderEditor();
  fireEvent.click(screen.getByRole('button', { name: /Add stage/ }));
  fireEvent.click(screen.getByRole('button', { name: /Add visibility gate/ }));
  fireEvent.change(screen.getByLabelText('Gate value for stage 1'), { target: { value: 'wfh' } });

  fireEvent.click(screen.getByRole('button', { name: 'Remove visibility gate for stage 1' }));
  assert.equal(screen.queryByLabelText('Gate value for stage 1'), null);

  fireEvent.click(screen.getByRole('button', { name: /Save Routing/ }));
  assert.equal(getSaved()?.approvers[0].when, undefined);
});

test('surfaces an incomplete gate condition instead of saving', () => {
  const { getSaved } = renderEditor();
  fireEvent.click(screen.getByRole('button', { name: /Add stage/ }));
  fireEvent.click(screen.getByRole('button', { name: /Add visibility gate/ }));
  // Leave the gate value empty.
  fireEvent.click(screen.getByRole('button', { name: /Save Routing/ }));

  assert.ok(screen.getByText('Every visibility condition needs a value, or remove the condition.'));
  assert.equal(getSaved(), undefined);
});

test('prefills existing stage rules including a saved gate condition', () => {
  const stageRules: StageRules = {
    approvers: [
      { source: 'field', field: 'project', when: { v: 1, when: { field: 'mode', op: 'eq', value: 'office' } } },
    ],
  };
  renderEditor({ stageRules });

  assert.equal((screen.getByLabelText('Approver field for stage 1') as HTMLSelectElement).value, 'project');
  assert.equal((screen.getByLabelText('Gate field for stage 1') as HTMLSelectElement).value, 'mode');
  assert.equal((screen.getByLabelText('Gate value for stage 1') as HTMLInputElement).value, 'office');
});

test('shows a server-supplied error and disables Save Routing while saving', () => {
  renderEditor({ saving: true, error: 'Boom' });
  assert.ok(screen.getByText('Boom'));
  assert.equal(screen.getByRole('button', { name: 'Saving…' }).hasAttribute('disabled'), true);
});
