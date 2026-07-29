import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SiteStatusBadge } from '../../src/sites/SiteStatusBadge.tsx';
import type { SiteStatus } from '../../src/api/sites.ts';

describe('SiteStatusBadge', () => {
  it('renders the ok state with agent details', () => {
    const status: SiteStatus = { state: 'ok', agentVersion: '1.2.3', contentSchemaVersion: 4, sqliteDriver: 'node:sqlite' };
    render(<SiteStatusBadge status={status} />);
    expect(screen.getByText(/OK - agent 1\.2\.3/)).toBeDefined();
  });

  it('renders the unreachable state', () => {
    render(<SiteStatusBadge status={{ state: 'unreachable', message: 'timeout' }} />);
    expect(screen.getByText('Unreachable')).toBeDefined();
  });

  it('renders the unauthorized state', () => {
    render(<SiteStatusBadge status={{ state: 'unauthorized', message: 'bad token' }} />);
    expect(screen.getByText('Unauthorized - check the token')).toBeDefined();
  });

  it('renders the error state with the underlying message', () => {
    render(<SiteStatusBadge status={{ state: 'error', message: 'not a cms-agent site' }} />);
    expect(screen.getByText('Error: not a cms-agent site')).toBeDefined();
  });
});
