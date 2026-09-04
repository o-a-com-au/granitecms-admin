import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { SearchInput } from '../../src/components/SearchInput.tsx';

function Wrapped() {
  const [value, setValue] = useState('');
  return <SearchInput value={value} onChange={setValue} placeholder="Search things" />;
}

describe('SearchInput', () => {
  it('has no clear button while empty', () => {
    render(<Wrapped />);
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });

  it('shows a clear button once there is a value, and hides it again once cleared', () => {
    render(<Wrapped />);
    const input = screen.getByPlaceholderText('Search things') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'granite' } });
    expect(input.value).toBe('granite');
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeDefined();

    fireEvent.change(input, { target: { value: '' } });
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });

  it('clicking the clear button empties the value', () => {
    render(<Wrapped />);
    const input = screen.getByPlaceholderText('Search things') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'granite' } });

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(input.value).toBe('');
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });

  it('renders a real type="search" input carrying the shared .content-search class, so existing styling still applies', () => {
    render(<Wrapped />);
    const input = screen.getByPlaceholderText('Search things');
    expect(input.getAttribute('type')).toBe('search');
    expect(input.className).toContain('content-search');
  });

  it('applies an extra className to the wrapper, not the input, for a call site with its own layout needs', () => {
    const { container } = render(
      <SearchInput value="" onChange={() => {}} placeholder="Search things" className="add-section-search" />,
    );
    const wrapper = container.querySelector('.search-input');
    expect(wrapper?.className).toContain('add-section-search');
    const input = screen.getByPlaceholderText('Search things');
    expect(input.className).not.toContain('add-section-search');
  });
});
