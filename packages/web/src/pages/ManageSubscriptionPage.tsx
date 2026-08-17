import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';
import { pauseAccount } from '../api/auth.ts';
import { ConfirmDialog } from '../editor/ConfirmDialog.tsx';

// Reachable by both roles (unlike /settings) - pausing was available
// to clients too when this lived in AppShell's popover, and stays so
// here.
export function ManageSubscriptionPage() {
  const { refresh } = useAuth();
  const [confirmingPause, setConfirmingPause] = useState(false);
  const [pausing, setPausing] = useState(false);

  // Pausing takes effect immediately once refresh() picks up the new
  // user.status - RequireAuth (wrapping the whole shell) swaps
  // straight to the paused notice on the very next render, no page
  // navigation involved.
  async function handleConfirmPause(): Promise<void> {
    setPausing(true);
    try {
      await pauseAccount();
      await refresh();
    } finally {
      setPausing(false);
      setConfirmingPause(false);
    }
  }

  return (
    <div className="list-page">
      <div className="list-page-inner">
        <h1>Manage Subscription</h1>

        <section>
          <h2>Plan</h2>
          <p>Plan and billing management is coming soon.</p>
        </section>

        <section>
          <h2>Pause subscription</h2>
          <p>Pausing signs you out of the admin until you resume. Your site stays live and unaffected.</p>
          <button type="button" onClick={() => setConfirmingPause(true)}>
            Pause subscription
          </button>
        </section>
      </div>

      {confirmingPause && (
        <ConfirmDialog
          message="Pause your subscription? You'll be signed out of the admin until you resume, but your site stays live and unaffected."
          confirmLabel="Pause subscription"
          busy={pausing}
          onConfirm={() => void handleConfirmPause()}
          onCancel={() => setConfirmingPause(false)}
        />
      )}
    </div>
  );
}
