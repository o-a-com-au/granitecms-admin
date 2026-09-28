import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBlocker, useParams } from 'react-router';
import { fetchSiteSettings, saveSiteSettings, type SiteSettingsData } from '../api/site-settings.ts';
import { SiteEditorError } from '../api/site-editor.ts';
import { ConfirmDialog } from '../editor/ConfirmDialog.tsx';
import { DeviceToggle } from '../editor/DeviceToggle.tsx';
import { usePageActions, usePageDeviceToggle } from '../layout/PageActionsContext.tsx';
import { usePreview, usePreviewVisible } from '../layout/PreviewContext.tsx';
import { SectionSettingsForm } from '../sections/SectionSettingsForm.tsx';
import { friendlyFieldErrorMessage } from '../sections/page-content.ts';
import { SiteStatusPanel } from '../site-status/SiteStatusPanel.tsx';
import { TopLoadingBar } from '../site-status/TopLoadingBar.tsx';
import { useToast } from '../toast/ToastContext.tsx';

// The Site Settings screen (the left rail's Settings): the values for
// the settings the site's theme defines in theme/config/settings_schema.json,
// as a form built from that schema - the same form a section's fields
// use - in the panel where Pages and Sections sit, with the live preview
// kept beside it. Changes stay here until Save Changes in the header,
// which puts them live at once, like a menu (there are no drafts; the
// owner's choice, matching how Shopify's theme settings save). The
// preview then reloads to show them.
export function SiteSettingsPage() {
  const { siteId = '' } = useParams<{ siteId: string }>();
  const { device, setDevice, bumpPreview } = usePreview();
  const { showToast } = useToast();
  usePreviewVisible(true);

  const [loaded, setLoaded] = useState<SiteSettingsData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    setLoadError(null);
    fetchSiteSettings(siteId)
      .then((data) => {
        if (!cancelled) {
          setLoaded(data);
          setValues(data.settings);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Could not load the site settings');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  const dirty = loaded !== null && JSON.stringify(values) !== JSON.stringify(loaded.settings);

  const discard = useCallback(() => {
    if (loaded) {
      setValues(loaded.settings);
      setFieldErrors({});
    }
  }, [loaded]);

  const save = useCallback(async () => {
    if (!loaded) {
      return;
    }
    setBusy(true);
    setFieldErrors({});
    try {
      const etag = await saveSiteSettings(siteId, values, loaded.etag, 'Update site settings');
      setLoaded({ ...loaded, settings: values, etag });
      bumpPreview();
      showToast('Site settings saved. They are live now.', 'success');
    } catch (error) {
      if (error instanceof SiteEditorError && error.validationErrors) {
        const map: Record<string, string> = {};
        for (const fieldError of error.validationErrors) {
          const key = fieldError.path.replace(/^\//, '').split('/')[0] ?? '';
          map[key] = friendlyFieldErrorMessage(fieldError);
        }
        setFieldErrors(map);
      }
      showToast(
        error instanceof SiteEditorError && error.reason === 'conflict'
          ? 'Someone else changed the site settings since you opened them. Reload to see their changes.'
          : error instanceof Error
            ? error.message
            : 'Could not save the site settings',
      );
    } finally {
      setBusy(false);
    }
  }, [loaded, siteId, values, bumpPreview, showToast]);

  const actions = useMemo(
    () =>
      dirty ? (
        <>
          <button type="button" onClick={discard} disabled={busy}>
            Discard Changes
          </button>
          <button type="button" className="button-primary" onClick={() => void save()} disabled={busy}>
            Save Changes
          </button>
        </>
      ) : null,
    [dirty, busy, discard, save],
  );
  usePageActions(actions);
  const deviceToggleNode = useMemo(() => <DeviceToggle device={device} onChange={setDevice} />, [device, setDevice]);
  usePageDeviceToggle(deviceToggleNode);

  // Leaving with unsaved changes asks first, as the page editor does.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

  let body;
  if (loadError) {
    body = <SiteStatusPanel variant="problem" message={loadError} actions={[]} />;
  } else if (!loaded) {
    body = <TopLoadingBar active />;
  } else if (!loaded.schema) {
    body = (
      <p>
        This website&apos;s theme has no site settings yet. A theme developer adds them in{' '}
        <code>theme/config/settings_schema.json</code>.
      </p>
    );
  } else {
    body = (
      <SectionSettingsForm siteId={siteId} schema={loaded.schema} settings={values} onChange={setValues} fieldErrors={fieldErrors} />
    );
  }

  return (
    <div className="media-hub settings-hub">
      <div className="media-hub-panel">
        <div className="panel-tab-shell">
          <div className="panel-heading-bar">
            <h2 className="panel-heading">Settings</h2>
          </div>
          <div className="editor-tab-content">
            <div className="editor-tab-panel media-hub-tab">{body}</div>
          </div>
        </div>
      </div>
      {blocker.state === 'blocked' && (
        <ConfirmDialog
          message="You have unsaved site settings. Leave without saving them?"
          confirmLabel="Discard Changes"
          busy={false}
          onConfirm={() => blocker.proceed()}
          onCancel={() => blocker.reset()}
        />
      )}
    </div>
  );
}
