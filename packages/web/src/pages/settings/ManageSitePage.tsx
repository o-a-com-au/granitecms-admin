import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useSites } from '../../sites/useSites.ts';
import { SiteStatusBadge } from '../../sites/SiteStatusBadge.tsx';
import { deleteSite, rotateSiteToken } from '../../api/sites.ts';
import { listSiteClients, revokeSiteClient, type SiteClient, type SiteOwner } from '../../api/site-users.ts';
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

  async function handleDelete(): Promise<void> {
    if (!siteId || !site) return;
    if (!window.confirm(`Delete ${site.url} from the registry? This does not affect the site itself.`)) {
      return;
    }
    await deleteSite(siteId);
    navigate('/settings/sites');
  }

  async function handleRevoke(client: SiteClient): Promise<void> {
    if (!siteId) return;
    if (!window.confirm(`Remove ${formatFullName(client.firstName, client.lastName)}'s access to this site?`)) {
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

  return (
    <>
      <section>
        <h2>Website Status</h2>
        <div className="settings-card">
          <p className="settings-site-url">{site.url}</p>
          <dl className="settings-status-list">
            <div>
              <dt>Status</dt>
              <dd>
                <SiteStatusBadge status={site.status} />
              </dd>
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
            <button type="button" onClick={() => setRotating(true)}>
              Rotate token
            </button>
          )}
        </div>
      </section>

      <section>
        <h2>Manage Access</h2>
        {clientsError && <p role="alert">{clientsError}</p>}
        {clients === null && !clientsError && <p>Loading...</p>}
        {clients !== null && (
          <ul className="settings-access-list">
            {owner && (
              <li>
                <span>
                  {formatFullName(owner.firstName, owner.lastName)} (owner)
                </span>
                <span className="settings-muted">{owner.email}</span>
              </li>
            )}
            {clients.map((client) => (
              <li key={client.id}>
                <span>{formatFullName(client.firstName, client.lastName)}</span>
                <span className="settings-muted">{client.email}</span>
                <button type="button" className="settings-text-link" onClick={() => void handleRevoke(client)}>
                  Revoke Access
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Invite Access</h2>
        <form onSubmit={handleInviteSubmit}>
          <label>
            Email addresses
            <textarea
              value={inviteAddresses}
              onChange={(event) => setInviteAddresses(event.target.value)}
              placeholder="Enter email addresses"
              rows={3}
            />
          </label>
          {inviteError && <p role="alert">{inviteError}</p>}
          {inviteResult && (
            <p role="status" className="success-notice">
              {inviteResult}
            </p>
          )}
          <button type="submit" className="button-primary" disabled={inviting}>
            Invite
          </button>
        </form>

        {pendingInvitesError && <p role="alert">{pendingInvitesError}</p>}
        {pendingInvites !== null && pendingInvites.filter((invite) => !invite.claimedAt).length > 0 && (
          <>
            <h3>Pending invites</h3>
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
        Delete this website
      </button>
    </>
  );
}
