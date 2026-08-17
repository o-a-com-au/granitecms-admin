import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useSites } from '../sites/useSites.ts';
import { SiteStatusBadge } from '../sites/SiteStatusBadge.tsx';
import { deleteSite, registerSite, rotateSiteToken } from '../api/sites.ts';
import { inviteSiteClient, listSiteClients, revokeSiteClient, type SiteClient } from '../api/site-users.ts';
import {
  createSiteInvite,
  listSiteInvites,
  revokeSiteInvite,
  type CreateSiteInviteResult,
  type SiteInviteSummary,
} from '../api/site-invites.ts';
import { writeLastSiteId } from '../sites/currentSite.ts';

export function SettingsPage() {
  const { sites, error, refresh } = useSites();
  const navigate = useNavigate();

  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [rotateToken, setRotateToken] = useState('');
  const [rotateError, setRotateError] = useState<string | null>(null);

  // Only one site's access panel expands at a time, the same
  // single-value convention rotatingId already establishes above -
  // clients/inviteUsername/etc. are all scoped to whichever site is
  // currently expanded, not keyed per-site.
  const [manageAccessId, setManageAccessId] = useState<string | null>(null);
  const [clients, setClients] = useState<SiteClient[] | null>(null);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  // Shown once, right after a genuinely new client account is
  // created - the server never returns this password again, so this
  // is the only chance to hand it to the developer.
  const [lastInvitedPassword, setLastInvitedPassword] = useState<string | null>(null);

  // The easier "invite by email" path, alongside the direct-entry form
  // above - the developer only ever types an email; the server emails
  // the client a claim link (or, if this server has no SMTP
  // configured, returns the link directly for the developer to share
  // themselves).
  const [pendingInvites, setPendingInvites] = useState<SiteInviteSummary[] | null>(null);
  const [pendingInvitesError, setPendingInvitesError] = useState<string | null>(null);
  const [inviteEmailAddress, setInviteEmailAddress] = useState('');
  const [inviteByEmailError, setInviteByEmailError] = useState<string | null>(null);
  const [invitingByEmail, setInvitingByEmail] = useState(false);
  const [lastInviteResult, setLastInviteResult] = useState<CreateSiteInviteResult | null>(null);

  async function handleRegister(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setRegisterError(null);
    setRegistering(true);
    try {
      const created = await registerSite(url, token);
      setUrl('');
      setToken('');
      await refresh();
      // Registering a site makes it "the" site to land in - the new
      // default-landing redirect at "/" reads this, so this is what
      // actually drops you into the editor right after registering,
      // rather than leaving you stranded on this registry screen.
      writeLastSiteId(created.id);
      navigate('/');
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : 'Failed to register the site');
    } finally {
      setRegistering(false);
    }
  }

  function startRotate(id: string): void {
    setRotatingId(id);
    setRotateToken('');
    setRotateError(null);
  }

  function cancelRotate(): void {
    setRotatingId(null);
    setRotateToken('');
    setRotateError(null);
  }

  async function handleRotateSubmit(event: FormEvent<HTMLFormElement>, id: string): Promise<void> {
    event.preventDefault();
    setRotateError(null);
    try {
      await rotateSiteToken(id, rotateToken);
      setRotatingId(null);
      setRotateToken('');
      await refresh();
    } catch (err) {
      setRotateError(err instanceof Error ? err.message : 'Failed to rotate the token');
    }
  }

  async function handleDelete(id: string, siteUrl: string): Promise<void> {
    if (!window.confirm(`Remove ${siteUrl} from the registry? This does not affect the site itself.`)) {
      return;
    }
    await deleteSite(id);
    await refresh();
  }

  async function loadClients(id: string): Promise<void> {
    setClientsError(null);
    try {
      setClients(await listSiteClients(id));
    } catch (err) {
      setClientsError(err instanceof Error ? err.message : 'Failed to load clients');
    }
  }

  async function loadPendingInvites(id: string): Promise<void> {
    setPendingInvitesError(null);
    try {
      setPendingInvites(await listSiteInvites(id));
    } catch (err) {
      setPendingInvitesError(err instanceof Error ? err.message : 'Failed to load invites');
    }
  }

  function startManageAccess(id: string): void {
    setManageAccessId(id);
    setClients(null);
    setClientsError(null);
    setInviteUsername('');
    setInviteName('');
    setInviteEmail('');
    setInviteError(null);
    setLastInvitedPassword(null);
    setPendingInvites(null);
    setPendingInvitesError(null);
    setInviteEmailAddress('');
    setInviteByEmailError(null);
    setLastInviteResult(null);
    void loadClients(id);
    void loadPendingInvites(id);
  }

  function cancelManageAccess(): void {
    setManageAccessId(null);
    setClients(null);
    setClientsError(null);
    setPendingInvites(null);
    setPendingInvitesError(null);
  }

  async function handleInviteByEmailSubmit(event: FormEvent<HTMLFormElement>, id: string): Promise<void> {
    event.preventDefault();
    setInviteByEmailError(null);
    setInvitingByEmail(true);
    try {
      const result = await createSiteInvite(id, inviteEmailAddress);
      setInviteEmailAddress('');
      setLastInviteResult(result);
      await loadPendingInvites(id);
    } catch (err) {
      setInviteByEmailError(err instanceof Error ? err.message : 'Failed to create the invite');
    } finally {
      setInvitingByEmail(false);
    }
  }

  async function handleRevokeInvite(id: string, invite: SiteInviteSummary): Promise<void> {
    if (!window.confirm(`Cancel the pending invite for ${invite.email}?`)) {
      return;
    }
    await revokeSiteInvite(id, invite.id);
    await loadPendingInvites(id);
  }

  async function handleInviteSubmit(event: FormEvent<HTMLFormElement>, id: string): Promise<void> {
    event.preventDefault();
    setInviteError(null);
    setInviting(true);
    try {
      const result = await inviteSiteClient(id, { username: inviteUsername, name: inviteName, email: inviteEmail });
      setInviteUsername('');
      setInviteName('');
      setInviteEmail('');
      setLastInvitedPassword(result.password ?? null);
      await loadClients(id);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to invite the client');
    } finally {
      setInviting(false);
    }
  }

  async function handleRevoke(id: string, client: SiteClient): Promise<void> {
    if (!window.confirm(`Remove ${client.username}'s access to this site?`)) {
      return;
    }
    await revokeSiteClient(id, client.id);
    setLastInvitedPassword(null);
    await loadClients(id);
  }

  return (
    <div className="list-page">
      <div className="list-page-inner">
        <h1>Site settings</h1>

        <section>
          <h2>Register a site</h2>
          <form onSubmit={handleRegister}>
            <label>
              Site URL
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com"
                required
              />
            </label>
            <label>
              API token
              <input value={token} onChange={(event) => setToken(event.target.value)} required />
            </label>
            {registerError && <p role="alert">{registerError}</p>}
            <button type="submit" disabled={registering}>
              Register
            </button>
          </form>
        </section>

        <section>
          <h2>Registered sites</h2>
          {error && <p role="alert">{error}</p>}
          {sites === null && !error && <p>Loading...</p>}
          {sites !== null && sites.length === 0 && <p>Nothing registered yet.</p>}
          {sites !== null && sites.length > 0 && (
            <table className="list-table">
              <thead>
                <tr>
                  <th>URL</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => (
                  <tr key={site.id}>
                    <td>{site.url}</td>
                    <td>
                      <SiteStatusBadge status={site.status} />
                    </td>
                    <td>
                      <Link to={`/sites/${site.id}/content`}>Browse content</Link>{' '}
                      {rotatingId === site.id ? (
                        <form onSubmit={(event) => handleRotateSubmit(event, site.id)}>
                          <label>
                            {`New token for ${site.url}`}
                            <input value={rotateToken} onChange={(event) => setRotateToken(event.target.value)} required />
                          </label>
                          <button type="submit">Save</button>
                          <button type="button" onClick={cancelRotate}>
                            Cancel
                          </button>
                          {rotateError && <span role="alert">{rotateError}</span>}
                        </form>
                      ) : (
                        <>
                          <button type="button" onClick={() => startRotate(site.id)}>
                            Rotate token
                          </button>
                          <button type="button" onClick={() => handleDelete(site.id, site.url)}>
                            Remove
                          </button>
                          {manageAccessId === site.id ? (
                            <button type="button" onClick={cancelManageAccess}>
                              Hide access
                            </button>
                          ) : (
                            <button type="button" onClick={() => startManageAccess(site.id)}>
                              Manage access
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {manageAccessId &&
                  (() => {
                    const site = sites.find((candidate) => candidate.id === manageAccessId);
                    if (!site) {
                      return null;
                    }
                    return (
                      <tr key={`${manageAccessId}-access`}>
                        <td colSpan={3}>
                          <div className="manage-access-panel">
                            <h3>{`Clients with access to ${site.url}`}</h3>
                            {clientsError && <p role="alert">{clientsError}</p>}
                            {clients === null && !clientsError && <p>Loading clients...</p>}
                            {clients !== null && clients.length === 0 && <p>No clients have access yet.</p>}
                            {clients !== null && clients.length > 0 && (
                              <ul>
                                {clients.map((client) => (
                                  <li key={client.id}>
                                    {client.name} ({client.username}, {client.email}){' '}
                                    <button type="button" onClick={() => void handleRevoke(manageAccessId, client)}>
                                      Revoke
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}

                            <h4>Invite by email</h4>
                            <form onSubmit={(event) => handleInviteByEmailSubmit(event, manageAccessId)}>
                              <label>
                                Email
                                <input
                                  type="email"
                                  value={inviteEmailAddress}
                                  onChange={(event) => setInviteEmailAddress(event.target.value)}
                                  required
                                />
                              </label>
                              {inviteByEmailError && <p role="alert">{inviteByEmailError}</p>}
                              <button type="submit" disabled={invitingByEmail}>
                                Send invite
                              </button>
                            </form>

                            {lastInviteResult && (
                              <p role="status" className="success-notice">
                                {lastInviteResult.emailSent
                                  ? 'Invite sent. They can follow the link in their email to get started.'
                                  : `Email isn't configured on this server - share this link with your client yourself: ${lastInviteResult.url}`}
                              </p>
                            )}

                            {pendingInvitesError && <p role="alert">{pendingInvitesError}</p>}
                            {pendingInvites !== null && pendingInvites.filter((invite) => !invite.claimedAt).length > 0 && (
                              <>
                                <h4>Pending invites</h4>
                                <ul>
                                  {pendingInvites
                                    .filter((invite) => !invite.claimedAt)
                                    .map((invite) => (
                                      <li key={invite.id}>
                                        {invite.email}{' '}
                                        <button type="button" onClick={() => void handleRevokeInvite(manageAccessId, invite)}>
                                          Cancel invite
                                        </button>
                                      </li>
                                    ))}
                                </ul>
                              </>
                            )}

                            <h4>Or invite with a chosen username and password</h4>
                            {lastInvitedPassword && (
                              // role="status", not "alert" - this is a success
                              // confirmation, not an error, and p[role='alert']
                              // carries this app's red/danger styling everywhere
                              // else (base.css), which would misread this as a
                              // failure.
                              <p role="status" className="success-notice">
                                {`One-time password for the new client: ${lastInvitedPassword}. This will not be shown again.`}
                              </p>
                            )}

                            <form onSubmit={(event) => handleInviteSubmit(event, manageAccessId)}>
                              <label>
                                Username
                                <input
                                  value={inviteUsername}
                                  onChange={(event) => setInviteUsername(event.target.value)}
                                  required
                                />
                              </label>
                              <label>
                                Name
                                <input value={inviteName} onChange={(event) => setInviteName(event.target.value)} required />
                              </label>
                              <label>
                                Email
                                <input
                                  type="email"
                                  value={inviteEmail}
                                  onChange={(event) => setInviteEmail(event.target.value)}
                                  required
                                />
                              </label>
                              {inviteError && <p role="alert">{inviteError}</p>}
                              <button type="submit" disabled={inviting}>
                                Invite client
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })()}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
