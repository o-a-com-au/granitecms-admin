import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext.tsx';
import { pauseAccount } from '../../api/auth.ts';
import { ConfirmDialog } from '../../editor/ConfirmDialog.tsx';

// Reachable by both roles - pausing is available to clients too.
export function SubscriptionPage() {
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
    <section>
      <h2>Manage Subscription</h2>
      <div className="settings-card">
        <h3>Your Plan</h3>
        <p className="settings-muted">Plan and billing management is coming soon.</p>
        <button type="button" className="button-primary" onClick={() => setConfirmingPause(true)}>
          Pause Subscription
        </button>
        <p className="settings-muted">Pausing will lock you out of making any edits to your websites. All websites will stay live and unaffected.</p>
      </div>

      {confirmingPause && (
        <ConfirmDialog
          message="Pause your subscription? You'll be signed out of the admin until you resume, but your website stays live and unaffected."
          confirmLabel="Pause Subscription"
          busy={pausing}
          onConfirm={() => void handleConfirmPause()}
          onCancel={() => setConfirmingPause(false)}
        />
      )}
    </section>
  );
}
