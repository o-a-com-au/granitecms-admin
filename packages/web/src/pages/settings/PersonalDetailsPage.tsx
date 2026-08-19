import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext.tsx';
import { updateAccount } from '../../api/account.ts';

// 'UTC' explicitly included, not just Intl.supportedValuesOf('timeZone')
// alone - at least on some ICU builds that list omits 'UTC' entirely
// despite it being the real, valid default new/backfilled accounts
// actually carry (see packages/server/src/auth/timezone.ts's own
// comment on the same gap). Without it, an account whose timezone
// really is 'UTC' would render this <select> with no matching option
// selected. Computed once at module load, not per render - static and
// the same list every time.
const TIMEZONE_OPTIONS = Array.from(new Set(['UTC', ...Intl.supportedValuesOf('timeZone')])).sort();

// Reachable by both roles - a client manages their own name(s)/email/
// timezone here too, not just developers.
export function PersonalDetailsPage() {
  const { user, refresh } = useAuth();

  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? 'UTC');

  // In practice this page only ever mounts once RequireAuth has
  // already resolved status to 'authenticated', by which point user
  // is populated - but AuthContext's own user starts out null and
  // only arrives asynchronously (getMe() inside refresh()), so the
  // useState initialisers above can't be trusted alone: they only run
  // once, at first mount. This syncs the fields once user actually
  // arrives (and again after this page's own save calls refresh() -
  // harmless, since local state already matches what was just saved).
  useEffect(() => {
    if (user) {
      setFirstName(user.firstName);
      setLastName(user.lastName);
      setEmail(user.email);
      setTimezone(user.timezone);
    }
  }, [user]);

  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsSaved, setDetailsSaved] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);

  async function handleDetailsSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setDetailsError(null);
    setDetailsSaved(false);
    setSavingDetails(true);
    try {
      await updateAccount({ firstName, lastName, email, timezone });
      // Updates the popover's own display immediately, no reload -
      // the same refresh() the pause/resume flow already uses.
      await refresh();
      setDetailsSaved(true);
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : 'Failed to update your account details');
    } finally {
      setSavingDetails(false);
    }
  }

  return (
    <section>
      <h2>Personal Details</h2>
      <form onSubmit={handleDetailsSubmit}>
        <div className="settings-name-fields">
          <label>
            First Name
            <input value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
          </label>
          <label>
            Last Name
            <input value={lastName} onChange={(event) => setLastName(event.target.value)} />
          </label>
        </div>
        <label>
          Email Address
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          Timezone
          <select value={timezone} onChange={(event) => setTimezone(event.target.value)} required>
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </label>
        {detailsError && <p role="alert">{detailsError}</p>}
        {detailsSaved && (
          <p role="status" className="success-notice">
            Account details updated.
          </p>
        )}
        <button type="submit" disabled={savingDetails}>
          Save
        </button>
      </form>
    </section>
  );
}
