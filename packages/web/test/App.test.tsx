import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../src/App.tsx';

describe('App', () => {
  it('A2: renders the skeleton app', () => {
    render(<App />);
    expect(screen.getByText('cms-agent admin')).toBeDefined();
  });
});
