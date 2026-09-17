import { describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
      <SearchInput value="" onChange={() => {}} placeholder="Search things" className="custom-search-sizing" />,
    );
    const wrapper = container.querySelector('.search-input');
    expect(wrapper?.className).toContain('custom-search-sizing');
    const input = screen.getByPlaceholderText('Search things');
    expect(input.className).not.toContain('custom-search-sizing');
  });

  it('renders a trailing control inside the field, alongside the clear button', () => {
    const { container } = render(
      <SearchInput value="granite" onChange={() => {}} placeholder="Search things" trailing={<button type="button">Filter</button>} />,
    );

    // Both live in one adornments row rather than being positioned
    // against the wrapper separately, which is what stops the clear
    // button and the trailing control landing on top of each other.
    const adornments = container.querySelector('.search-input-adornments');
    expect(adornments).not.toBeNull();
    expect(adornments?.querySelector('.search-input-clear')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Filter' })).toBeDefined();
  });

  it('only reserves room for a trailing control when there is one', () => {
    // The reservation is a flat padding on the input, so a call site
    // without a trailing slot (Redirects, Add Section) must not get it.
    const { container: without } = render(
      <SearchInput value="" onChange={() => {}} placeholder="Search things" />,
    );
    expect(without.querySelector('.search-input')?.className).not.toContain('search-input--has-trailing');

    cleanup();

    const { container: with_ } = render(
      <SearchInput value="" onChange={() => {}} placeholder="Search things" trailing={<span>x</span>} />,
    );
    expect(with_.querySelector('.search-input')?.className).toContain('search-input--has-trailing');
  });
});
