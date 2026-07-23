import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import type { StatusModel } from '@se/shared';
import { StatusModelEditor } from './StatusModelEditor';

afterEach(cleanup);

type Props = ComponentProps<typeof StatusModelEditor>;

function renderEditor(overrides: Partial<Props> = {}) {
  let saved: StatusModel | undefined;
  render(
    <StatusModelEditor
      statusModel={null}
      disabled={false}
      saving={false}
      error={null}
      onSave={(model) => {
        saved = model;
      }}
      {...overrides}
    />,
  );
  return { getSaved: () => saved };
}

function stateInputs(): HTMLInputElement[] {
  return screen.getAllByLabelText(/^State \d+ name$/) as HTMLInputElement[];
}

function addState(name: string) {
  fireEvent.click(screen.getByRole('button', { name: /Add state/ }));
  const inputs = stateInputs();
  fireEvent.change(inputs[inputs.length - 1], { target: { value: name } });
}

test('requires at least two states before transitions can be configured', () => {
  renderEditor();
  assert.ok(screen.getByText('Add at least two states before configuring transitions.'));
  assert.equal(screen.queryByRole('button', { name: /Add transition/ }), null);
});

test('adds states with unique auto-generated names', () => {
  renderEditor();
  fireEvent.click(screen.getByRole('button', { name: /Add state/ }));
  fireEvent.click(screen.getByRole('button', { name: /Add state/ }));
  const inputs = stateInputs();
  assert.equal(inputs[0].value, 'New state');
  assert.equal(inputs[1].value, 'New state 2');
});

test('blocks renaming a state to a name already used by another state', () => {
  renderEditor();
  addState('Draft');
  addState('Approved');

  fireEvent.change(stateInputs()[1], { target: { value: 'Draft' } });

  assert.ok(screen.getByText('"Draft" is already used by another state — state names must be unique.'));
  assert.equal(stateInputs()[1].value, 'Approved');
});

test('renaming a state keeps its transition endpoints in sync', () => {
  renderEditor();
  addState('Draft');
  addState('Approved');
  fireEvent.click(screen.getByRole('button', { name: /Add transition/ }));
  assert.equal((screen.getByLabelText('From state for transition 1') as HTMLSelectElement).value, 'Draft');

  fireEvent.change(stateInputs()[0], { target: { value: 'Pending' } });

  assert.equal((screen.getByLabelText('From state for transition 1') as HTMLSelectElement).value, 'Pending');
});

test('blocks removing a state that is referenced by a transition', () => {
  renderEditor();
  addState('Draft');
  addState('Approved');
  fireEvent.click(screen.getByRole('button', { name: /Add transition/ }));

  fireEvent.click(screen.getByRole('button', { name: 'Remove state "Draft"' }));

  assert.ok(
    screen.getByText('Can\'t remove "Draft" — it\'s used in a transition below. Remove that transition first.'),
  );
  assert.equal(stateInputs().length, 2);

  fireEvent.click(screen.getByRole('button', { name: 'Remove transition 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove state "Draft"' }));
  assert.equal(stateInputs().length, 1);
});

test('reorders states via drag and drop', () => {
  renderEditor();
  addState('A');
  addState('B');
  addState('C');

  const rows = stateInputs().map((el) => el.closest('[draggable]') as HTMLElement);
  fireEvent.dragStart(rows[0], { dataTransfer: { setData: () => {} } });
  fireEvent.drop(rows[2]);

  assert.deepEqual(
    stateInputs().map((el) => el.value),
    ['B', 'C', 'A'],
  );
});

test('adds a transition defaulting to the first two states and toggles an allowed role', () => {
  const { getSaved } = renderEditor();
  addState('Draft');
  addState('Approved');
  fireEvent.click(screen.getByRole('button', { name: /Add transition/ }));
  assert.equal((screen.getByLabelText('To state for transition 1') as HTMLSelectElement).value, 'Approved');

  fireEvent.click(screen.getByRole('button', { name: 'HR Head' }));
  fireEvent.click(screen.getByRole('button', { name: /Save Status Model/ }));

  assert.deepEqual(getSaved()?.transitions[0], { from: 'Draft', to: 'Approved', roles: ['hr-head'] });
});

test('removes a transition', () => {
  renderEditor();
  addState('Draft');
  addState('Approved');
  fireEvent.click(screen.getByRole('button', { name: /Add transition/ }));

  fireEvent.click(screen.getByRole('button', { name: 'Remove transition 1' }));

  assert.equal(screen.queryByLabelText('From state for transition 1'), null);
});

test('blocks saving with no states at all', () => {
  const { getSaved } = renderEditor();
  fireEvent.click(screen.getByRole('button', { name: /Save Status Model/ }));
  assert.ok(screen.getByText('Add at least one state.'));
  assert.equal(getSaved(), undefined);
});

test('blocks saving a transition with no roles selected', () => {
  const { getSaved } = renderEditor();
  addState('Draft');
  addState('Approved');
  fireEvent.click(screen.getByRole('button', { name: /Add transition/ }));

  fireEvent.click(screen.getByRole('button', { name: /Save Status Model/ }));

  assert.ok(screen.getByText('Pick at least one role for every transition, or remove it.'));
  assert.equal(getSaved(), undefined);
});

test('prefills states and transitions from the statusModel prop', () => {
  const statusModel: StatusModel = {
    states: ['Draft', 'Approved'],
    transitions: [{ from: 'Draft', to: 'Approved', roles: ['hr-head'] }],
  };
  const { getSaved } = renderEditor({ statusModel });

  assert.deepEqual(
    stateInputs().map((el) => el.value),
    ['Draft', 'Approved'],
  );
  assert.equal((screen.getByLabelText('From state for transition 1') as HTMLSelectElement).value, 'Draft');

  fireEvent.click(screen.getByRole('button', { name: /Save Status Model/ }));
  assert.deepEqual(getSaved(), statusModel);
});

test('shows a non-blocking guardrail warning (missing terminal state) but still allows saving', () => {
  const statusModel: StatusModel = {
    states: ['A', 'B'],
    transitions: [
      { from: 'A', to: 'B', roles: ['hr-head'] },
      { from: 'B', to: 'A', roles: ['hr-head'] },
    ],
  };
  const { getSaved } = renderEditor({ statusModel });

  assert.ok(screen.getByText(/At least one terminal state \(with no outgoing transitions\) is required/));

  fireEvent.click(screen.getByRole('button', { name: /Save Status Model/ }));
  assert.deepEqual(getSaved(), statusModel);
});

test('shows a server-supplied error and disables Save Status Model while saving', () => {
  renderEditor({ saving: true, error: 'Boom' });
  assert.ok(screen.getByText('Boom'));
  assert.equal(screen.getByRole('button', { name: 'Saving…' }).hasAttribute('disabled'), true);
});
