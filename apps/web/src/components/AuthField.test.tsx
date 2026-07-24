import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AuthField } from './AuthField';

afterEach(cleanup);

test('renders the label and an input carrying the given type/placeholder/value', () => {
  render(
    <AuthField label="Email" type="email" value="a@b.com" placeholder="Enter your email" onChange={() => {}} />,
  );
  assert.ok(screen.getByText('Email'));
  const input = screen.getByDisplayValue('a@b.com') as HTMLInputElement;
  assert.equal(input.type, 'email');
  assert.equal(input.placeholder, 'Enter your email');
});

test('calls onChange with the new value as the user types', () => {
  let lastValue: string | undefined;
  render(<AuthField label="Password" type="password" value="" onChange={(v) => (lastValue = v)} />);
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
  assert.equal(lastValue, 'secret123');
});

test('renders an icon when one is provided', () => {
  render(
    <AuthField
      label="Email"
      type="email"
      value=""
      onChange={() => {}}
      icon={<span data-testid="mail-icon">@</span>}
    />,
  );
  assert.ok(screen.getByTestId('mail-icon'));
});

test('omits the icon wrapper when no icon is provided', () => {
  const { container } = render(<AuthField label="Email" type="email" value="" onChange={() => {}} />);
  assert.equal(container.querySelectorAll('span').length, 1);
});
