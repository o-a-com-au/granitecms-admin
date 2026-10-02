import { useEffect, useMemo, useRef, type FormEvent, type KeyboardEvent } from 'react';
import { useParams } from 'react-router';
import { DeviceToggle } from '../editor/DeviceToggle.tsx';
import { DraftActionButtons } from '../editor/DraftActionButtons.tsx';
import { usePreviewNavigationGuard } from '../editor/usePreviewNavigationGuard.tsx';
import { useSectionClickToEdit } from '../editor/useSectionClickToEdit.ts';
import { usePageActions, usePageDeviceToggle } from '../layout/PageActionsContext.tsx';
import { usePreview, usePreviewVisible } from '../layout/PreviewContext.tsx';
import { useAssistant } from './AssistantContext.tsx';
import { AssistantText } from './AssistantText.tsx';
import { AstroidIcon } from './AstroidIcon.tsx';

// Starting points shown in an empty chat; picking one fills the input
// rather than sending, so it can be finished off first.
const SUGGESTIONS = ['Add a new page about ', 'Which pages mention ', 'Tidy up the wording on the home page'];

// The Assistant: a chat panel on the left, the website preview on the
// right, the same shape as Settings. The conversation itself lives in
// AssistantProvider (AppShell), so it survives moving to other screens
// and back; a reload or New chat starts afresh (agreed: not saved).
// The assistant leaves its changes as drafts, so the same Save Changes
// and Discard Changes actions Pages and Media show sit in the top bar.
export function AssistantPage() {
  const { siteId = '' } = useParams<{ siteId: string }>();
  const { device, setDevice } = usePreview();
  const { messages, draft, busy, setDraft, send, stop, newChat, setPanelOpen } = useAssistant();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  usePreviewVisible(true);
  const { requestPreviewSwitch, promptElement, hasDraft, neverPublished, actionsBusy, publishCurrent, discardCurrent } =
    usePreviewNavigationGuard(siteId);
  useSectionClickToEdit(siteId, requestPreviewSwitch);
  const pageActionsNode = useMemo(
    () =>
      hasDraft ? (
        <DraftActionButtons busy={actionsBusy} neverPublished={neverPublished} onDiscard={discardCurrent} onPublish={publishCurrent} />
      ) : null,
    [hasDraft, neverPublished, actionsBusy, discardCurrent, publishCurrent],
  );
  usePageActions(pageActionsNode);
  const deviceToggleNode = useMemo(() => <DeviceToggle device={device} onChange={setDevice} />, [device, setDevice]);
  usePageDeviceToggle(deviceToggleNode);

  useEffect(() => {
    setPanelOpen(true);
    return () => setPanelOpen(false);
  }, [setPanelOpen]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages]);

  function submit(event?: FormEvent): void {
    event?.preventDefault();
    send();
  }

  // A page link in a reply: the person moving to it, so the usual
  // leave-with-a-draft prompt applies (as in the page list).
  function openPage(url: string): void {
    const stem = url.replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/^\/+/, '');
    requestPreviewSwitch({ path: stem === '' ? 'pages/index.json' : `pages/${stem}.json`, url: stem === '' ? '/' : `/${stem}` });
  }

  // Enter sends; Shift+Enter starts a new line.
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  function startNewChat(): void {
    newChat();
    inputRef.current?.focus();
  }

  return (
    <div className="media-hub settings-hub assistant-hub">
      <div className="media-hub-panel">
        <div className="panel-tab-shell">
          <div className="panel-heading-bar assistant-heading-bar">
            <h2 className="panel-heading">Assistant</h2>
            {messages.length > 0 && (
              <button type="button" className="assistant-new-chat" onClick={startNewChat}>
                New chat
              </button>
            )}
          </div>
          <div className="assistant-messages" aria-live="polite">
            {messages.length === 0 ? (
              <div className="assistant-empty">
                <span className="assistant-empty-icon">
                  <AstroidIcon size={40} strokeWidth={0.75} />
                </span>
                <p>How can I help with your website?</p>
                <div className="assistant-suggestions">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="assistant-suggestion"
                      onClick={() => {
                        setDraft(suggestion);
                        inputRef.current?.focus();
                      }}
                    >
                      {suggestion.trim()}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ol className="assistant-message-list">
                {messages.map((message) => (
                  <li key={message.id} className={`assistant-message is-${message.role}${message.status === 'error' ? ' is-error' : ''}`}>
                    {message.role === 'user' ? message.text : <AssistantText text={message.text} openPage={openPage} />}
                    {message.status === 'streaming' && message.activity && (
                      <span className="assistant-activity">{message.activity}...</span>
                    )}
                    {message.status === 'stopped' && <span className="assistant-activity is-static">Stopped</span>}
                  </li>
                ))}
              </ol>
            )}
            <div ref={endRef} />
          </div>
          <form className="assistant-composer" onSubmit={submit}>
            <textarea
              ref={inputRef}
              aria-label="Message the assistant"
              placeholder="Ask for a change, or a question about your website"
              rows={3}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            {busy ? (
              <button type="button" className="assistant-send" aria-label="Stop" onClick={stop}>
                <StopIcon />
              </button>
            ) : (
              <button type="submit" className="assistant-send" aria-label="Send" disabled={draft.trim() === ''}>
                <ArrowUpIcon />
              </button>
            )}
          </form>
        </div>
      </div>
      {promptElement}
    </div>
  );
}

// Lucide's "square" (https://lucide.dev, ISC licensed), filled, for Stop.
function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="14" height="14" x="5" y="5" rx="2" />
    </svg>
  );
}

// Lucide's "arrow-up" (https://lucide.dev, ISC licensed).
function ArrowUpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </svg>
  );
}
