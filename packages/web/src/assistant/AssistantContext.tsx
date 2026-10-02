import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AssistantError, streamAssistant, type AssistantEvent, type AssistantTurn } from '../api/assistant.ts';
import { usePreview } from '../layout/PreviewContext.tsx';
import { switchPreviewTo } from '../editor/usePreviewNavigationGuard.tsx';

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

interface Conversation {
  messages: ChatMessage[];
  // What's typed but not sent yet.
  draft: string;
  busy: boolean;
}

interface AssistantContextValue extends Conversation {
  setDraft: (draft: string) => void;
  send: () => void;
  stop: () => void;
  newChat: () => void;
  // Set by the Assistant page while it's showing: the preview only
  // follows the assistant around while the person is watching it.
  setPanelOpen: (open: boolean) => void;
}

const EMPTY: Conversation = { messages: [], draft: '', busy: false };

const AssistantContext = createContext<AssistantContextValue | null>(null);

// The conversation as the server takes it: what was said, leaving out
// failed replies (their text is an error message, not something the
// assistant said).
function toTurns(messages: ChatMessage[]): AssistantTurn[] {
  return messages
    .filter((message) => message.role === 'user' || (message.status !== 'error' && message.text.trim() !== ''))
    .map(({ role, text }) => ({ role, text }));
}

// Holds each website's conversation above the routes (in AppShell), so
// moving to Pages or the Editor and back keeps it, and a reply still
// being written carries on meanwhile. Not saved anywhere: a reload or
// New chat starts afresh (agreed).
export function AssistantProvider({ siteId, children }: { siteId: string; children: ReactNode }) {
  const { previewUrl, setPreview, bumpPreview } = usePreview();
  const [conversations, setConversations] = useState<Record<string, Conversation>>({});
  const controllers = useRef(new Map<string, AbortController>());
  const nextId = useRef(1);
  const panelOpen = useRef(false);
  // Read at send time, without rebuilding send on every preview move.
  const previewUrlRef = useRef(previewUrl);
  previewUrlRef.current = previewUrl;

  useEffect(() => {
    const running = controllers.current;
    return () => {
      for (const controller of running.values()) {
        controller.abort();
      }
    };
  }, []);

  const update = useCallback((site: string, change: (conversation: Conversation) => Conversation) => {
    setConversations((current) => ({ ...current, [site]: change(current[site] ?? EMPTY) }));
  }, []);

  // Updates the reply being written (always the last message).
  const updateReply = useCallback(
    (site: string, change: (reply: ChatMessage) => ChatMessage) => {
      update(site, (conversation) => {
        const reply = conversation.messages.at(-1);
        return reply && reply.role === 'assistant'
          ? { ...conversation, messages: [...conversation.messages.slice(0, -1), change(reply)] }
          : conversation;
      });
    },
    [update],
  );

  const handleEvent = useCallback(
    (site: string, event: AssistantEvent) => {
      if (event.type === 'text') {
        updateReply(site, (reply) => ({ ...reply, text: reply.text + event.text, activity: undefined }));
      } else if (event.type === 'tool') {
        updateReply(site, (reply) => ({ ...reply, activity: event.label }));
      } else if (event.type === 'show' || event.type === 'changed') {
        // Straight to the page, without the leave-with-a-draft prompt:
        // the assistant moving between pages it's working on isn't the
        // person leaving one. Recorded as the current page too, which
        // is what the top bar checks for a draft. Only while the person
        // is on the Assistant: elsewhere they're doing something else.
        if (panelOpen.current) {
          switchPreviewTo(site, setPreview, { path: event.path, url: event.url });
        }
        if (event.type === 'changed') {
          bumpPreview();
        }
      } else if (event.type === 'done') {
        updateReply(site, (reply) => ({ ...reply, status: 'done', activity: undefined }));
      } else {
        updateReply(site, (reply) => ({ ...reply, status: 'error', text: event.message, activity: undefined }));
      }
    },
    [updateReply, setPreview, bumpPreview],
  );

  const conversation = conversations[siteId] ?? EMPTY;

  const send = useCallback(() => {
    const site = siteId;
    const current = conversations[site] ?? EMPTY;
    const text = current.draft.trim();
    if (text === '' || current.busy) {
      return;
    }
    const userMessage: ChatMessage = { id: nextId.current++, role: 'user', text };
    const reply: ChatMessage = { id: nextId.current++, role: 'assistant', text: '', status: 'streaming', activity: 'Thinking' };
    const history = toTurns([...current.messages, userMessage]);
    update(site, (conversation) => ({ messages: [...conversation.messages, userMessage, reply], draft: '', busy: true }));

    const controller = new AbortController();
    controllers.current.set(site, controller);
    streamAssistant(site, { messages: history, currentUrl: previewUrlRef.current }, (event) => handleEvent(site, event), controller.signal)
      .then(() => {
        // A stream that ended without saying so (a dropped connection).
        updateReply(site, (current) => (current.status === 'streaming' ? { ...current, status: 'done', activity: undefined } : current));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          updateReply(site, (current) => ({ ...current, status: 'stopped', activity: undefined }));
        } else {
          const message = error instanceof AssistantError ? error.message : 'The assistant could not be reached. Try again.';
          updateReply(site, (current) => ({ ...current, status: 'error', text: message, activity: undefined }));
        }
      })
      .finally(() => {
        if (controllers.current.get(site) === controller) {
          controllers.current.delete(site);
          update(site, (conversation) => ({ ...conversation, busy: false }));
        }
      });
  }, [siteId, conversations, update, updateReply, handleEvent]);

  const stop = useCallback(() => {
    controllers.current.get(siteId)?.abort();
  }, [siteId]);

  const newChat = useCallback(() => {
    const controller = controllers.current.get(siteId);
    controllers.current.delete(siteId);
    controller?.abort();
    update(siteId, () => EMPTY);
  }, [siteId, update]);

  const setDraft = useCallback((draft: string) => update(siteId, (conversation) => ({ ...conversation, draft })), [siteId, update]);

  const setPanelOpen = useCallback((open: boolean) => {
    panelOpen.current = open;
  }, []);

  return (
    <AssistantContext.Provider value={{ ...conversation, setDraft, send, stop, newChat, setPanelOpen }}>{children}</AssistantContext.Provider>
  );
}

export function useAssistant(): AssistantContextValue {
  const value = useContext(AssistantContext);
  if (!value) {
    throw new Error('useAssistant must be used inside AssistantProvider');
  }
  return value;
}
