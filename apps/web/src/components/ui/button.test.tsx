import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRef } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { Button } from './button';

afterEach(cleanup);

test('Button renders as a native button with the default variant and size classes', () => {
  render(<Button>Save</Button>);
  const button = screen.getByRole('button', { name: 'Save' });
  assert.ok(button.className.includes('bg-brand'));
  assert.ok(button.className.includes('h-10'));
});

test('Button applies each variant\'s distinguishing classes', () => {
  const variants = {
    default: 'bg-brand',
    secondary: 'bg-surface',
    outline: 'border-brand',
    ghost: 'border-transparent',
    danger: 'bg-danger',
  } as const;
  for (const [variant, expected] of Object.entries(variants)) {
    const { unmount } = render(<Button variant={variant as keyof typeof variants}>Go</Button>);
    assert.ok(screen.getByRole('button').className.includes(expected), variant);
    unmount();
  }
});

test('Button applies each size\'s height class', () => {
  const sizes = { sm: 'h-8', default: 'h-10', lg: 'h-12' } as const;
  for (const [size, expected] of Object.entries(sizes)) {
    const { unmount } = render(<Button size={size as keyof typeof sizes}>Go</Button>);
    assert.ok(screen.getByRole('button').className.includes(expected), size);
    unmount();
  }
});

test('Button fullWidth adds w-full', () => {
  render(<Button fullWidth>Go</Button>);
  assert.ok(screen.getByRole('button').className.includes('w-full'));
});

test('Button merges a custom className onto the variant classes', () => {
  render(<Button className="custom-class">Go</Button>);
  const button = screen.getByRole('button');
  assert.ok(button.className.includes('custom-class'));
  assert.ok(button.className.includes('bg-brand'));
});

test('Button forwards its ref to the underlying element', () => {
  const ref = createRef<HTMLButtonElement>();
  render(<Button ref={ref}>Go</Button>);
  assert.ok(ref.current instanceof HTMLButtonElement);
});

test('Button respects the disabled attribute', () => {
  render(<Button disabled>Go</Button>);
  assert.ok((screen.getByRole('button') as HTMLButtonElement).disabled);
});

test('Button asChild renders the child element instead of a button, with variant classes applied', () => {
  render(
    <Button asChild variant="secondary">
      <a href="/somewhere">Link</a>
    </Button>,
  );
  const link = screen.getByRole('link', { name: 'Link' });
  assert.equal(link.tagName, 'A');
  assert.ok(link.className.includes('bg-surface'));
  assert.equal(screen.queryByRole('button'), null);
});
