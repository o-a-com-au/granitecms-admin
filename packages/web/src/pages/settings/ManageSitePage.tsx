import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useSites } from '../../sites/useSites.ts';
import { deleteSite, reindexSite, rotateSiteToken } from '../../api/sites.ts';
import { listSiteClients, revokeSiteClient, type SiteClient, type SiteOwner } from '../../api/site-users.ts';
import { InstanceRowActions } from '../../sections/InstanceRowActions.tsx';
import { TrashIcon } from '../../sections/TrashIcon.tsx';
import {
  createSiteInvite,
  listSiteInvites,
  revokeSiteInvite,
  type SiteInviteSummary,
} from '../../api/site-invites.ts';
import { formatFullName } from '../../auth/fullName.ts';

// Splits the "Enter email addresses" box on commas and/or newlines -
// the design's plural wording is real behaviour, not just copy: one
// paste can invite several people at once. Trimmed, empties dropped,
// duplicates collapsed - the developer pasting a list from elsewhere
// shouldn't have to hand-dedupe it first.
function parseEmailAddresses(raw: string): string[] {
  const addresses = raw
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  return Array.from(new Set(addresses));
}

// Developer-only (App.tsx wraps this route in RequireDeveloper),
// reached via "Edit" from ManageSitesPage - the one detail view for a
// single registered site: live status, token rotation, who has
// access, inviting more people, and deleting the registration.
export function ManageSitePage() {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const { sites, refresh: refreshSites } = useSites();
  const site = sites?.find((candidate) => candidate.id === siteId);

  const [rotating, setRotating] = useState(false);
  const [rotateToken, setRotateToken] = useState('');
  const [rotateError, setRotateError] = useState<string | null>(null);

  const [reindexing, setReindexing] = useState(false);
  const [reindexResult, setReindexResult] = useState<string | null>(null);
  const [reindexError, setReindexError] = useState<string | null>(null);

  const [owner, setOwner] = useState<SiteOwner | null>(null);
  const [clients, setClients] = useState<SiteClient[] | null>(null);
  const [clientsError, setClientsError] = useState<string | null>(null);

  const [inviteAddresses, setInviteAddresses] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const [pendingInvites, setPendingInvites] = useState<SiteInviteSummary[] | null>(null);
  const [pendingInvitesError, setPendingInvitesError] = useState<string | null>(null);

  async function loadClients(): Promise<void> {
    if (!siteId) return;
    setClientsError(null);
    try {
      const result = await listSiteClients(siteId);
      setOwner(result.owner);
      setClients(result.clients);
    } catch (err) {
      setClientsError(err instanceof Error ? err.message : 'Failed to load clients');
    }
  }

  async function loadPendingInvites(): Promise<void> {
    if (!siteId) return;
    setPendingInvitesError(null);
    try {
      setPendingInvites(await listSiteInvites(siteId));
    } catch (err) {
      setPendingInvitesError(err instanceof Error ? err.message : 'Failed to load invites');
    }
  }

  // Loaded once per siteId, not tied to the sites list's own load
  // state - navigating from one site's Manage Site page directly to
  // another's re-runs this rather than showing stale data.
  useEffect(() => {
    void loadClients();
    void loadPendingInvites();
  }, [siteId]);

  async function handleRotateSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!siteId) return;
    setRotateError(null);
    try {
      await rotateSiteToken(siteId, rotateToken);
      setRotating(false);
      setRotateToken('');
      await refreshSites();
    } catch (err) {
      setRotateError(err instanceof Error ? err.message : 'Failed to rotate the token');
    }
  }

  // The server rate-limits this per site, not per admin (routes/sites.ts) -
  // a 429 (Search was reindexed recently...) is an expected, everyday
  // outcome when another admin already triggered one, so it renders the
  // same as any other reindexError rather than needing its own special
  // case here.
  async function handleReindex(): Promise<void> {
    if (!siteId) return;
    setReindexError(null);
    setReindexResult(null);
    setReindexing(true);
    try {
      await reindexSite(siteId);
      setReindexResult('Search index rebuilt.');
    } catch (err) {
      setReindexError(err instanceof Error ? err.message : 'Failed to reindex search');
    } finally {
      setReindexing(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!siteId || !site) return;
    if (!window.confirm(`Delete ${site.url} from the registry? This does not affect the website itself.`)) {
      return;
    }
    await deleteSite(siteId);
    navigate('/settings/sites');
  }

  async function handleRevoke(client: SiteClient): Promise<void> {
    if (!siteId) return;
    if (!window.confirm(`Remove ${formatFullName(client.firstName, client.lastName)}'s access to this website?`)) {
      return;
    }
    await revokeSiteClient(siteId, client.id);
    await loadClients();
  }

  async function handleRevokeInvite(invite: SiteInviteSummary): Promise<void> {
    if (!siteId) return;
    if (!window.confirm(`Cancel the pending invite for ${invite.email}?`)) {
      return;
    }
    await revokeSiteInvite(siteId, invite.id);
    await loadPendingInvites();
  }

  async function handleInviteSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!siteId) return;
    setInviteError(null);
    setInviteResult(null);

    const addresses = parseEmailAddresses(inviteAddresses);
    if (addresses.length === 0) {
      setInviteError('Enter at least one email address');
      return;
    }

    setInviting(true);
    try {
      const outcomes = await Promise.allSettled(addresses.map((address) => createSiteInvite(siteId, address)));
      const succeeded = outcomes.filter((outcome) => outcome.status === 'fulfilled').length;
      const failed = outcomes
        .map((outcome, index) => (outcome.status === 'rejected' ? { address: addresses[index], reason: outcome.reason } : null))
        .filter((entry): entry is { address: string; reason: unknown } => entry !== null);

      if (succeeded > 0) {
        setInviteAddresses('');
      }
      const successSummary = `${succeeded} invite${succeeded === 1 ? '' : 's'} sent`;
      const failureSummary =
        failed.length > 0
          ? `; ${failed.length} failed: ${failed
              .map(({ address, reason }) => `${address} (${reason instanceof Error ? reason.message : 'unknown error'})`)
              .join(', ')}`
          : '';
      setInviteResult(`${successSummary}${failureSummary}`);
      await loadPendingInvites();
    } finally {
      setInviting(false);
    }
  }

  if (!site) {
    return (
      <section>
        <p>Loading...</p>
      </section>
    );
  }

  // en-AU, day/month/year, matching every other date this app shows a
  // person (history/buildRestoreMessage.ts's own identical call) -
  // just the date, no time, since "when was this registered" doesn't
  // need minute-level precision the way a commit timestamp does.
  const registeredOn = new Date(site.createdAt).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <>
      <h2>Manage Website</h2>

      <section className="manage-site-panel">
        <h3 className="panel-heading">Website Details</h3>
        <dl className="website-status-meta">
          <div>
            <dt>Domain</dt>
            <dd>{site.url}</dd>
          </div>
          {site.status.state === 'ok' && (
            <>
              <div>
                <dt>Agent</dt>
                <dd>{site.status.agentVersion}</dd>
              </div>
              <div>
                <dt>Schema</dt>
                <dd>v{site.status.contentSchemaVersion}</dd>
              </div>
              <div>
                <dt>Node</dt>
                <dd>{site.status.sqliteDriver}</dd>
              </div>
            </>
          )}
          <div>
            <dt>Registered</dt>
            <dd>{registeredOn}</dd>
          </div>
        </dl>
        {rotating ? (
          <form onSubmit={handleRotateSubmit}>
            <label>
              New API token
              <input value={rotateToken} onChange={(event) => setRotateToken(event.target.value)} required />
            </label>
            {rotateError && <p role="alert">{rotateError}</p>}
            <button type="submit">Save</button>
            <button type="button" onClick={() => setRotating(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <>
            <button type="button" onClick={() => setRotating(true)}>
              Rotate token
            </button>
            <button type="button" onClick={() => void handleReindex()} disabled={reindexing}>
              {reindexing ? 'Reindexing…' : 'Reindex Search'}
            </button>
            {reindexResult && (
              <p role="status" className="success-notice">
                {reindexResult}
              </p>
            )}
            {reindexError && <p role="alert">{reindexError}</p>}
          </>
        )}
      </section>

      <section className="manage-site-panel">
        <h3 className="panel-heading">Active Users</h3>
        {clientsError && <p role="alert">{clientsError}</p>}
        {clients === null && !clientsError && <p>Loading...</p>}
        {clients !== null && (
          <ul className="instance-list">
            {owner && (
              <li className="instance-row">
                <div className="instance-row-main is-owner">
                  <span className="instance-row-label">
                    <strong>{formatFullName(owner.firstName, owner.lastName)} (Owner)</strong>
                    <span className="instance-row-label-sub">{owner.email}</span>
                  </span>
                  {/* No action here at all - there's nothing to action
                      against the owner themselves (requested directly,
                      a deliberate deviation from the mockup, which
                      shows one on every row purely for symmetry). */}
                </div>
              </li>
            )}
            {clients.map((client) => (
              <li key={client.id} className="instance-row">
                <div className="instance-row-main">
                  <span className="instance-row-label">
                    <strong>{formatFullName(client.firstName, client.lastName)}</strong>
                    <span className="instance-row-label-sub">{client.email}</span>
                  </span>
                  <InstanceRowActions
                    actions={[
                      {
                        key: 'remove',
                        label: `Remove ${formatFullName(client.firstName, client.lastName)}'s access`,
                        icon: <TrashIcon />,
                        variant: 'destructive',
                        onClick: () => void handleRevoke(client),
                      },
                    ]}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="manage-site-panel">
        <h3 className="panel-heading">Invite Users</h3>
        <form onSubmit={handleInviteSubmit} className="manage-site-invite-form">
          <input
            value={inviteAddresses}
            onChange={(event) => setInviteAddresses(event.target.value)}
            placeholder="Enter Email Address"
            aria-label="Email addresses"
          />
          <button type="submit" className="button-primary" disabled={inviting}>
            Invite
          </button>
        </form>
        {inviteError && <p role="alert">{inviteError}</p>}
        {inviteResult && (
          <p role="status" className="success-notice">
            {inviteResult}
          </p>
        )}

        {pendingInvitesError && <p role="alert">{pendingInvitesError}</p>}
        {pendingInvites !== null && pendingInvites.filter((invite) => !invite.claimedAt).length > 0 && (
          <>
            <h4>Pending invites</h4>
            <ul className="settings-access-list">
              {pendingInvites
                .filter((invite) => !invite.claimedAt)
                .map((invite) => (
                  <li key={invite.id}>
                    <span>{invite.email}</span>
                    <button type="button" className="settings-text-link" onClick={() => void handleRevokeInvite(invite)}>
                      Cancel invite
                    </button>
                  </li>
                ))}
            </ul>
          </>
        )}
      </section>

      <button type="button" className="settings-text-link" onClick={() => void handleDelete()}>
        <TrashIcon />
        Delete Website
      </button>
    </>
  );
}
