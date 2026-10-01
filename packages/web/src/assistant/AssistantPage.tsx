import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useParams } from 'react-router';
import { DeviceToggle } from '../editor/DeviceToggle.tsx';
import { DraftActionButtons } from '../editor/DraftActionButtons.tsx';
import { usePreviewNavigationGuard } from '../editor/usePreviewNavigationGuard.tsx';
import { useSectionClickToEdit } from '../editor/useSectionClickToEdit.ts';
import { usePageActions, usePageDeviceToggle } from '../layout/PageActionsContext.tsx';
import { usePreview, usePreviewVisible } from '../layout/PreviewContext.tsx';
import { AstroidIcon } from './AstroidIcon.tsx';

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
}

// Starting points shown in an empty chat; picking one fills the input
// rather than sending, so it can be finished off first.
const SUGGESTIONS = ['Add a new page about ', 'Which pages mention ', 'Tidy up the wording on the home page'];

// Until the assistant is connected (step 2 of the plan), every message
// gets this reply, so the panel itself can be tried out.
const NOT_CONNECTED_REPLY = "I'm not connected yet. Soon I'll be able to answer questions about your website and make changes for you.";

// The Assistant: a chat panel on the left, the website preview on the
// right, the same shape as Settings. A conversation lasts until the
// page is reloaded or New chat is pressed (agreed: not saved for now).
// The assistant leaves its changes as drafts, so the same Publish and
// Discard actions Pages and Media show sit in the top bar here too.
export function AssistantPage() {
  const { siteId = '' } = useParams<{ siteId: string }>();
  const { device, setDevice } = usePreview();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const nextId = useRef(1);
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
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages]);

  function send(event?: FormEvent): void {
    event?.preventDefault();
    const text = draft.trim();
    if (text === '') {
      return;
    }
    const userMessage: ChatMessage = { id: nextId.current++, role: 'user', text };
    const reply: ChatMessage = { id: nextId.current++, role: 'assistant', text: NOT_CONNECTED_REPLY };
    setMessages((current) => [...current, userMessage, reply]);
    setDraft('');
  }

  // Enter sends; Shift+Enter starts a new line.
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  }

  function newChat(): void {
    setMessages([]);
    setDraft('');
    inputRef.current?.focus();
  }

  return (
    <div className="media-hub settings-hub assistant-hub">
      <div className="media-hub-panel">
        <div className="panel-tab-shell">
          <div className="panel-heading-bar assistant-heading-bar">
            <h2 className="panel-heading">Assistant</h2>
            {messages.length > 0 && (
              <button type="button" className="assistant-new-chat" onClick={newChat}>
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
                  <li key={message.id} className={`assistant-message is-${message.role}`}>
                    {message.text}
                  </li>
                ))}
              </ol>
            )}
            <div ref={endRef} />
          </div>
          <form className="assistant-composer" onSubmit={send}>
            <textarea
              ref={inputRef}
              aria-label="Message the assistant"
              placeholder="Ask for a change, or a question about your website"
              rows={3}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button type="submit" className="assistant-send" aria-label="Send" disabled={draft.trim() === ''}>
              <ArrowUpIcon />
            </button>
          </form>
        </div>
      </div>
      {promptElement}
    </div>
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
