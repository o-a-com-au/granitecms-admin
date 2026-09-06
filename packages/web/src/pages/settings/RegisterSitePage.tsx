import { Link, useNavigate } from 'react-router';
import { useRegisterSiteForm } from '../../sites/useRegisterSiteForm.ts';
import { writeLastSiteId } from '../../sites/currentSite.ts';

// Split out of ManageSitesPage.tsx into its own route (requested
// directly) - registering a new site is a rare, deliberate action, not
// something that needs a permanent form at the top of the list every
// developer scrolls past to see their existing sites.
export function RegisterSitePage() {
  const navigate = useNavigate();
  const { url, setUrl, token, setToken, registerError, registering, handleRegister } = useRegisterSiteForm(
    async (created) => {
      // Registering a site makes it "the" site to land in - the
      // default-landing redirect at "/" reads this, so this is what
      // actually drops you into the editor right after registering,
      // same behaviour as before the form moved to its own page.
      writeLastSiteId(created.id);
      navigate('/');
    },
  );

  return (
    <section>
      <Link to="/settings/sites" className="settings-back-link">
        ← Manage Websites
      </Link>
      <h2>Register a website</h2>
      <form onSubmit={handleRegister} className="settings-card">
        <label>
          Website URL
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
  );
}
