import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import type { FormFieldDto, VisibilityRule } from '@se/shared';
import { FieldModal, type FieldModalSaveInput } from './FieldModal';

afterEach(cleanup);

type ModalProps = ComponentProps<typeof FieldModal>;

function renderModal(overrides: Partial<ModalProps> = {}) {
  let saved: FieldModalSaveInput | undefined;
  let closed = false;
  render(
    <FieldModal
      mode="add"
      initial={null}
      existingKeys={[]}
      otherFields={[]}
      onClose={() => {
        closed = true;
      }}
      onSave={(field) => {
        saved = field;
      }}
      {...overrides}
    />,
  );
  return { getSaved: () => saved, isClosed: () => closed };
}

function fieldTypeSelect(): HTMLSelectElement {
  // `exact: false` because the locked-type helper text (usedAsStage/isCoreForm) is rendered
  // inside the same <label>, making its full text content more than just "Field type".
  return screen.getByLabelText('Field type', { exact: false }) as HTMLSelectElement;
}

test('add mode saves a slugified key from the label with defaults', () => {
  const { getSaved } = renderModal();

  fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'Manager Name' } });
  fireEvent.click(screen.getByRole('button', { name: /Save Field/ }));

  assert.deepEqual(getSaved(), {
    key: 'manager-name',
    label: 'Manager Name',
    type: 'text',
    required: false,
    options: undefined,
    visibilityRule: undefined,
  });
});

test('blocks saving with an empty label', () => {
  const { getSaved } = renderModal();

  fireEvent.click(screen.getByRole('button', { name: /Save Field/ }));

  assert.ok(screen.getByText('Field label is required.'));
  assert.equal(getSaved(), undefined);
});

test('a choice type requires at least one option before saving', () => {
  const { getSaved } = renderModal();
  fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'Status' } });
  fireEvent.change(fieldTypeSelect(), { target: { value: 'single-select' } });

  fireEvent.click(screen.getByRole('button', { name: /Save Field/ }));

  assert.ok(screen.getByText('Add at least one option.'));
  assert.equal(getSaved(), undefined);
});

test('adds and removes options for a choice type, saving only labeled ones', () => {
  const { getSaved } = renderModal();
  fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'Status' } });
  fireEvent.change(fieldTypeSelect(), { target: { value: 'single-select' } });

  fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
  fireEvent.change(screen.getByPlaceholderText('e.g. Approved'), { target: { value: 'Yes' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
  const optionInputs = screen.getAllByPlaceholderText('e.g. Approved');
  fireEvent.change(optionInputs[1], { target: { value: 'No' } });
  // Remove the first option ("Yes"), keeping only "No".
  fireEvent.click(screen.getAllByRole('button', { name: 'Remove option' })[0]);

  fireEvent.click(screen.getByRole('button', { name: /Save Field/ }));

  const saved = getSaved();
  assert.deepEqual(saved?.options, [{ value: 'no', label: 'No' }]);
});

test('edit mode prefills the label and type, keeping the original key on save', () => {
  const initial: FormFieldDto = {
    key: 'existing-key',
    label: 'Old Label',
    type: 'text',
    required: true,
    options: null,
    validation: null,
    visibilityRule: null,
  };
  const { getSaved } = renderModal({ mode: 'edit', initial });

  assert.equal((screen.getByLabelText('Field label') as HTMLInputElement).value, 'Old Label');
  assert.equal(fieldTypeSelect().value, 'text');

  fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'New Label' } });
  fireEvent.click(screen.getByRole('switch')); // required → off
  fireEvent.click(screen.getByRole('button', { name: /Save Field/ }));

  const saved = getSaved();
  assert.equal(saved?.key, 'existing-key');
  assert.equal(saved?.label, 'New Label');
  assert.equal(saved?.required, false);
});

test('locks the type select when the field is used as a routing stage', () => {
  renderModal({ usedAsStage: true });
  assert.equal(fieldTypeSelect().disabled, true);
  assert.ok(screen.getByText(/Used as an approver stage in Routing/));
});

test('locks the type select for a core-form field', () => {
  renderModal({ isCoreForm: true });
  assert.equal(fieldTypeSelect().disabled, true);
  assert.ok(screen.getByText(/Core form fields can't change type/));
});

test('prompts to add another field before a visibility condition can be set', () => {
  renderModal({ otherFields: [] });
  assert.ok(screen.getByText('Add another field to this form to set a visibility condition.'));
  assert.equal(screen.queryByRole('button', { name: /Add condition/ }), null);
});

test('adds a visibility condition and saves it as a rule', () => {
  const { getSaved } = renderModal({
    otherFields: [{ key: 'mode', label: 'Mode', type: 'single-select' }],
  });
  fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'Reason' } });

  fireEvent.click(screen.getByRole('button', { name: /Add condition/ }));
  fireEvent.change(screen.getByLabelText('Value for condition 1'), { target: { value: 'wfh' } });
  fireEvent.click(screen.getByRole('button', { name: /Save Field/ }));

  assert.deepEqual(getSaved()?.visibilityRule, { v: 1, when: { field: 'mode', op: 'eq', value: 'wfh' } });
});

test('surfaces an incomplete visibility condition instead of saving it', () => {
  const { getSaved } = renderModal({
    otherFields: [{ key: 'mode', label: 'Mode', type: 'single-select' }],
  });
  fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'Reason' } });

  fireEvent.click(screen.getByRole('button', { name: /Add condition/ }));
  fireEvent.click(screen.getByRole('button', { name: /Save Field/ }));

  assert.ok(screen.getByText('Every visibility condition needs a value, or remove the condition.'));
  assert.equal(getSaved(), undefined);
});

test('keeps an OR visibility rule untouched until the section is edited', () => {
  const orRule: VisibilityRule = {
    v: 1,
    when: { or: [{ field: 'mode', op: 'eq', value: 'wfh' }, { field: 'mode', op: 'eq', value: 'remote' }] },
  };
  const initial: FormFieldDto = {
    key: 'reason',
    label: 'Reason',
    type: 'text',
    required: false,
    options: null,
    validation: null,
    visibilityRule: orRule,
  };
  const { getSaved } = renderModal({
    mode: 'edit',
    initial,
    otherFields: [{ key: 'mode', label: 'Mode', type: 'single-select' }],
  });

  assert.ok(screen.getByText(/advanced condition/));
  fireEvent.click(screen.getByRole('button', { name: /Save Field/ }));

  assert.deepEqual(getSaved()?.visibilityRule, orRule);
});

test('restricts a picker field to selected roles', () => {
  const { getSaved } = renderModal();
  fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'Approver' } });
  fireEvent.change(fieldTypeSelect(), { target: { value: 'user-picker' } });

  fireEvent.click(screen.getByRole('button', { name: 'Employee' }));
  fireEvent.click(screen.getByRole('button', { name: /Save Field/ }));

  assert.deepEqual(getSaved()?.options, { roles: ['employee'] });
});

test('shows a busy state and a server-supplied error', () => {
  renderModal({ busy: true, error: 'Something went wrong' });
  assert.ok(screen.getByText('Something went wrong'));
  assert.equal(screen.getByRole('button', { name: 'Saving…' }).hasAttribute('disabled'), true);
  assert.equal(screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled'), true);
});
