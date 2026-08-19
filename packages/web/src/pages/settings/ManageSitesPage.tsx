import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useSites } from '../../sites/useSites.ts';
import { SiteStatusBadge } from '../../sites/SiteStatusBadge.tsx';
import { registerSite } from '../../api/sites.ts';
import { writeLastSiteId } from '../../sites/currentSite.ts';

// Developer-only (App.tsx wraps this route in RequireDeveloper) - a
// client never registers or owns a site. Per-site actions (rotate
// token, manage access, delete) all live on ManageSitePage now,
// reached via "Edit" - this page is just registration + the list.
export function ManageSitesPage() {
  const { sites, error, refresh } = useSites();
  const navigate = useNavigate();

  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  async function handleRegister(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setRegisterError(null);
    setRegistering(true);
    try {
      const created = await registerSite(url, token);
      setUrl('');
      setToken('');
      await refresh();
      // Registering a site makes it "the" site to land in - the
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

  return (
    <>
      <section>
        <h2>Register a website</h2>
        <form onSubmit={handleRegister} className="settings-card">
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
            API Token
            <input value={token} onChange={(event) => setToken(event.target.value)} required />
          </label>
          {registerError && <p role="alert">{registerError}</p>}
          <button type="submit" className="button-primary" disabled={registering}>
            Register
          </button>
        </form>
      </section>

      <section>
        <h2>Active websites</h2>
        {error && <p role="alert">{error}</p>}
        {sites === null && !error && <p>Loading...</p>}
        {sites !== null && sites.length === 0 && <p>Nothing registered yet.</p>}
        {sites !== null && sites.length > 0 && (
          <ul className="settings-site-list">
            {sites.map((site) => (
              <li key={site.id} className="settings-site-row">
                <div>
                  <p className="settings-site-url">{site.url}</p>
                  <SiteStatusBadge status={site.status} />
                </div>
                <div className="settings-site-actions">
                  <Link to={`/sites/${site.id}/content`}>Browse content</Link>
                  <Link to={`/settings/sites/${site.id}`} className="settings-edit-link">
                    Edit
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
