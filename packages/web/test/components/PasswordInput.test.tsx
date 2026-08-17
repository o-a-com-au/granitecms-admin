import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { PasswordInput } from '../../src/components/PasswordInput.tsx';

function Wrapped() {
  const [value, setValue] = useState('');
  return <PasswordInput label="Password" value={value} onChange={(event) => setValue(event.target.value)} />;
}

describe('PasswordInput', () => {
  it('is masked by default', () => {
    render(<Wrapped />);
    const input = screen.getByLabelText('Password') as HTMLInputElement;
    expect(input.type).toBe('password');
  });

  it('clicking the toggle reveals the value as plain text and flips the accessible name', () => {
    render(<Wrapped />);
    const input = screen.getByLabelText('Password') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'a real value' } });

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));

    expect(input.type).toBe('text');
    expect(input.value).toBe('a real value');
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeDefined();
  });

  it('clicking the toggle again re-masks the field', () => {
    render(<Wrapped />);
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));

    const input = screen.getByLabelText('Password') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(screen.getByRole('button', { name: 'Show password' })).toBeDefined();
  });

  it('renders the hint text when provided', () => {
    render(
      <PasswordInput label="Password" value="" onChange={() => {}} hint="At least 8 characters." />,
    );
    expect(screen.getByText('At least 8 characters.')).toBeDefined();
  });
});
