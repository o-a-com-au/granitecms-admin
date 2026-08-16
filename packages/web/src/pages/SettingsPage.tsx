import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useSites } from '../sites/useSites.ts';
import { SiteStatusBadge } from '../sites/SiteStatusBadge.tsx';
import { deleteSite, registerSite, rotateSiteToken } from '../api/sites.ts';
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

  return (
    <div>
      <h1>cms-agent admin</h1>

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
          <table>
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
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
