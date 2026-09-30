import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { createApiKey, listApiKeys, revokeApiKey, type ApiKeyPermission, type ApiKeysData, type ApiKeyView } from '../../api/api-keys.ts';
import { ConfirmDialog } from '../../editor/ConfirmDialog.tsx';

const PERMISSIONS: Array<{ value: ApiKeyPermission; label: string; description: string }> = [
  { value: 'read', label: 'Read only', description: 'Look at pages, settings, menus and media. Changes nothing.' },
  { value: 'draft', label: 'Save drafts', description: 'Also write and save drafts for a person to review and publish.' },
  {
    value: 'publish',
    label: 'Save drafts and publish',
    description: 'Also publish pages and change site settings, menus and redirects, which go live straight away.',
  },
];

function permissionLabel(permission: ApiKeyPermission): string {
  return PERMISSIONS.find((option) => option.value === permission)?.label ?? permission;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// Settings -> AI Agents: personal API keys that let an AI assistant
// (through the Granite MCP server) work on your websites as you, with
// whatever permission you give each key. Part of the Pro plan: only
// sites whose owner is on Pro can be given a key.
export function AiAgentsPage() {
  const [data, setData] = useState<ApiKeysData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [siteIds, setSiteIds] = useState<string[]>([]);
  const [permission, setPermission] = useState<ApiKeyPermission>('draft');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<ApiKeyView | null>(null);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(() => {
    listApiKeys()
      .then((loaded) => {
        setData(loaded);
        setLoadError(null);
      })
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'Could not load your API keys'));
  }, []);

  useEffect(load, [load]);

  function toggleSite(id: string): void {
    setSiteIds((current) => (current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id]));
  }

  async function handleCreate(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (siteIds.length === 0) {
      setCreateError('Choose at least one website.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createApiKey({ name: name.trim(), siteIds, permission });
      setNewKey(created.key);
      setCopied(false);
      setName('');
      setSiteIds([]);
      load();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Could not create the API key');
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy(): Promise<void> {
    if (newKey) {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
    }
  }

  async function handleRevoke(): Promise<void> {
    if (!pendingRevoke) {
      return;
    }
    setRevoking(true);
    try {
      await revokeApiKey(pendingRevoke.id);
      setPendingRevoke(null);
      load();
    } finally {
      setRevoking(false);
    }
  }

  const siteUrl = (id: string) => data?.eligibleSites.find((site) => site.id === id)?.url ?? 'A website you no longer have on Pro';

  return (
    <section className="ai-agents-page">
      <h2>AI Agents</h2>
      <p className="settings-muted">
        An API key lets an AI assistant, such as Claude, work on your websites as you: reading pages, writing drafts and, if you
        allow it, publishing. Everything it changes is marked in each page&apos;s history as done by an AI agent, and can be undone
        there.
      </p>
      {loadError && <p role="alert">{loadError}</p>}
      {data === null && !loadError && <p>Loading...</p>}

      {data !== null && data.eligibleSites.length === 0 && (
        <div className="settings-card">
          <h3 className="panel-heading">Part of the Pro plan</h3>
          <p className="settings-muted">AI agent access is available on websites whose owner is on the Pro plan.</p>
        </div>
      )}

      {newKey && (
        <div className="settings-card ai-agents-new-key" role="status">
          <h3 className="panel-heading">Your new API key</h3>
          <p>Copy it now. For your security it won&apos;t be shown again.</p>
          <code className="ai-agents-key">{newKey}</code>
          <div className="ai-agents-actions">
            <button type="button" className="button-primary" onClick={() => void handleCopy()}>
              {copied ? 'Copied' : 'Copy key'}
            </button>
            <button type="button" onClick={() => setNewKey(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      {data !== null && data.eligibleSites.length > 0 && (
        <section className="manage-site-panel">
          <h3 className="panel-heading">Create an API key</h3>
          <form onSubmit={(event) => void handleCreate(event)}>
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Claude on my laptop" maxLength={60} required />
            </label>
            <fieldset className="ai-agents-fieldset">
              <legend>Websites</legend>
              {data.eligibleSites.map((site) => (
                <label key={site.id} className="ai-agents-choice">
                  <input type="checkbox" checked={siteIds.includes(site.id)} onChange={() => toggleSite(site.id)} />
                  {site.url}
                </label>
              ))}
            </fieldset>
            <fieldset className="ai-agents-fieldset">
              <legend>What it may do</legend>
              {PERMISSIONS.map((option) => (
                <label key={option.value} className="ai-agents-choice">
                  <input type="radio" name="permission" checked={permission === option.value} onChange={() => setPermission(option.value)} />
                  <span>
                    {option.label}
                    <span className="settings-muted ai-agents-choice-description">{option.description}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {createError && <p role="alert">{createError}</p>}
            <button type="submit" className="button-primary" disabled={creating}>
              Create key
            </button>
          </form>
        </section>
      )}

      {data !== null && data.keys.length > 0 && (
        <section className="manage-site-panel">
          <h3 className="panel-heading">Your API keys</h3>
          <ul className="settings-access-list ai-agents-keys">
            {data.keys.map((key) => (
              <li key={key.id} className="ai-agents-key-row">
                <div>
                  <strong>{key.name}</strong> <code>{key.prefix}...</code>
                  <p className="settings-muted">
                    {permissionLabel(key.permission)} on {key.siteIds.map(siteUrl).join(', ')}
                  </p>
                  <p className="settings-muted">
                    Created {formatDate(key.createdAt)}. {key.lastUsedAt ? `Last used ${formatDate(key.lastUsedAt)}.` : 'Never used.'}
                  </p>
                </div>
                <button type="button" onClick={() => setPendingRevoke(key)}>
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pendingRevoke && (
        <ConfirmDialog
          message={`Revoke "${pendingRevoke.name}"? Any AI assistant using it stops working straight away.`}
          confirmLabel="Revoke"
          busy={revoking}
          onConfirm={() => void handleRevoke()}
          onCancel={() => setPendingRevoke(null)}
        />
      )}
    </section>
  );
}
