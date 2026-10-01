import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useParams } from 'react-router';
import { DeviceToggle } from '../editor/DeviceToggle.tsx';
import { DraftActionButtons } from '../editor/DraftActionButtons.tsx';
import { usePreviewNavigationGuard } from '../editor/usePreviewNavigationGuard.tsx';
import { useSectionClickToEdit } from '../editor/useSectionClickToEdit.ts';
import { usePageActions, usePageDeviceToggle } from '../layout/PageActionsContext.tsx';
import { usePreview, usePreviewVisible } from '../layout/PreviewContext.tsx';
import { AssistantError, streamAssistant, type AssistantEvent, type AssistantTurn } from '../api/assistant.ts';
import { AssistantText } from './AssistantText.tsx';
import { AstroidIcon } from './AstroidIcon.tsx';

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  // An assistant reply's state: still being written, finished, stopped
  // by the person, or failed (text is then the error).
  status?: 'streaming' | 'done' | 'stopped' | 'error';
  // What it's doing right now, e.g. "Reading /about", while streaming.
  activity?: string;
}

// Starting points shown in an empty chat; picking one fills the input
// rather than sending, so it can be finished off first.
const SUGGESTIONS = ['Add a new page about ', 'Which pages mention ', 'Tidy up the wording on the home page'];

// The conversation as the server takes it: what was said, leaving out
// failed replies (their text is an error message, not something the
// assistant said).
function toTurns(messages: ChatMessage[]): AssistantTurn[] {
  return messages
    .filter((message) => message.role === 'user' || (message.status !== 'error' && message.text.trim() !== ''))
    .map(({ role, text }) => ({ role, text }));
}

// The Assistant: a chat panel on the left, the website preview on the
// right, the same shape as Settings. A conversation lasts until the
// page is reloaded or New chat is pressed (agreed: not saved for now).
// Each message goes to the admin's server with the conversation so far
// and the page in the preview; the reply streams back as it's written.
// The assistant leaves its changes as drafts, so the same Publish and
// Discard actions Pages and Media show sit in the top bar here too.
export function AssistantPage() {
  const { siteId = '' } = useParams<{ siteId: string }>();
  const { device, setDevice, previewUrl, bumpPreview } = usePreview();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [controller, setController] = useState<AbortController | null>(null);
  const busy = controller !== null;
  const nextId = useRef(1);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  usePreviewVisible(true);
  const { requestPreviewSwitch, showPage, promptElement, hasDraft, neverPublished, actionsBusy, publishCurrent, discardCurrent } =
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

  // Updates the reply being written (always the last message).
  function updateReply(update: (reply: ChatMessage) => ChatMessage): void {
    setMessages((current) => {
      const reply = current.at(-1);
      return reply && reply.role === 'assistant' ? [...current.slice(0, -1), update(reply)] : current;
    });
  }

  function handleEvent(event: AssistantEvent): void {
    if (event.type === 'text') {
      updateReply((reply) => ({ ...reply, text: reply.text + event.text, activity: undefined }));
    } else if (event.type === 'tool') {
      updateReply((reply) => ({ ...reply, activity: event.label }));
    } else if (event.type === 'show') {
      showPage({ path: event.path, url: event.url });
    } else if (event.type === 'changed') {
      // Straight to the page it changed, reloaded: the person sees the
      // change, and the top bar's Save Changes / Discard Changes catch
      // up with its new draft. Not through the leave-with-a-draft
      // prompt: the assistant moving between pages it's working on
      // isn't the person leaving one. showPage, not a bare setPreview:
      // it also records the page as the current one, which is what the
      // top bar checks for a draft (and where Editor opens).
      showPage({ path: event.path, url: event.url });
      bumpPreview();
    } else if (event.type === 'done') {
      updateReply((reply) => ({ ...reply, status: 'done', activity: undefined }));
    } else {
      updateReply((reply) => ({ ...reply, status: 'error', text: event.message, activity: undefined }));
    }
  }

  async function send(event?: FormEvent): Promise<void> {
    event?.preventDefault();
    const text = draft.trim();
    if (text === '' || busy) {
      return;
    }
    const userMessage: ChatMessage = { id: nextId.current++, role: 'user', text };
    const reply: ChatMessage = { id: nextId.current++, role: 'assistant', text: '', status: 'streaming', activity: 'Thinking' };
    const history = toTurns([...messages, userMessage]);
    setMessages((current) => [...current, userMessage, reply]);
    setDraft('');

    const abort = new AbortController();
    setController(abort);
    try {
      await streamAssistant(siteId, { messages: history, currentUrl: previewUrl }, handleEvent, abort.signal);
      // A stream that ended without saying so (a dropped connection).
      updateReply((current) => (current.status === 'streaming' ? { ...current, status: 'done', activity: undefined } : current));
    } catch (error) {
      if (abort.signal.aborted) {
        updateReply((current) => ({ ...current, status: 'stopped', activity: undefined }));
      } else {
        const message = error instanceof AssistantError ? error.message : 'The assistant could not be reached. Try again.';
        updateReply((current) => ({ ...current, status: 'error', text: message, activity: undefined }));
      }
    } finally {
      setController(null);
    }
  }

  function stop(): void {
    controller?.abort();
  }

  // Enter sends; Shift+Enter starts a new line.
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  function newChat(): void {
    controller?.abort();
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
                  <li key={message.id} className={`assistant-message is-${message.role}${message.status === 'error' ? ' is-error' : ''}`}>
                    {message.role === 'user' ? message.text : <AssistantText text={message.text} />}
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
          <form className="assistant-composer" onSubmit={(event) => void send(event)}>
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
