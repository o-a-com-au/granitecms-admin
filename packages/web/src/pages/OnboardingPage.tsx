import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useRegisterSiteForm } from '../sites/useRegisterSiteForm.ts';
import { writeLastSiteId } from '../sites/currentSite.ts';

// The bare, full-screen first-run welcome (docs reference: a developer
// who has genuinely never registered a site) - reached only via
// HomeRedirect.tsx's own "/" landing logic, never by navigating
// Settings > Manage Sites deliberately (that always shows the normal
// Settings-shell view, ManageSitesPage.tsx, even with zero sites - a
// developer who chose to go there wants the registry, not a welcome
// screen, and stays a single-step form). Not nested under
// SettingsLayout - no sidebar, matching the reference design exactly.
//
// Two steps rather than one combined form: domain first, then the API
// token with room for real instructions alongside it - the two are
// different kinds of input (something you already know vs. something
// you have to go and find), and cramming both into one screen gave the
// token no room to explain itself.
export function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);

  const { url, setUrl, token, setToken, registerError, registering, handleRegister } = useRegisterSiteForm((created) => {
    // Registering makes it "the" site to land in - "/" reads this back
    // (currentSite.ts), which is what actually drops a fresh developer
    // into the editor right after registering, rather than leaving
    // them stranded here.
    writeLastSiteId(created.id);
    navigate('/');
  });

  function handleContinue(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setStep(2);
  }

  return (
    <div className="onboarding-page">
      {/* key={step} here, not just on the form - forces the whole block
          (heading included) to remount on every step change, even
          though both branches render the same element types at the
          same position. Without it React just patches the existing
          DOM in place, and the mount-triggered fade-in below never
          replays past the first paint. */}
      <div className="onboarding-content onboarding-step" key={step}>
        <h1>
          Welcome to Granite CMS.
          <br />
          Let&apos;s add your first website.
        </h1>

        {step === 1 ? (
          <form onSubmit={handleContinue} className="onboarding-form">
            <label>
              Website URL
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com"
                required
                autoFocus
              />
            </label>
            <button type="submit" className="button-primary">
              Continue
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="onboarding-form">
            <p>Enter the API token for your website to finish connecting it.</p>
            <label>
              API Token
              <input value={token} onChange={(event) => setToken(event.target.value)} required autoFocus />
            </label>
            {registerError && <p role="alert">{registerError}</p>}
            <div className="onboarding-step-actions">
              <button type="button" onClick={() => setStep(1)} disabled={registering}>
                Back
              </button>
              <button type="submit" className="button-primary" disabled={registering}>
                Register
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
