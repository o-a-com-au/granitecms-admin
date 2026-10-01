// The in-app assistant (server: routes/assistant.ts). One call per
// message the person sends, carrying the conversation so far; the reply
// streams back as newline-separated JSON events.

export type AssistantEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; label: string }
  // Show a page in the preview, or reload one the assistant just changed.
  | { type: 'show'; path: string; url: string }
  | { type: 'changed'; path: string; url: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface AssistantTurn {
  role: 'user' | 'assistant';
  text: string;
}

// A refusal before anything streamed: not on Pro, not set up, and so on.
export class AssistantError extends Error {
  readonly reason: string;

  constructor(message: string, reason: string) {
    super(message);
    this.name = 'AssistantError';
    this.reason = reason;
  }
}

export async function streamAssistant(
  siteId: string,
  request: { messages: AssistantTurn[]; currentUrl: string | null },
  onEvent: (event: AssistantEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok || !response.body) {
    let message = 'The assistant could not be reached. Try again.';
    let reason = 'error';
    try {
      // The assistant route's own refusals carry { error, reason }; a
      // general failure elsewhere (a 500) has no reason and keeps the
      // general message.
      const body = (await response.json()) as { error?: unknown; reason?: unknown };
      if (typeof body.reason === 'string') {
        reason = body.reason;
        if (typeof body.error === 'string') {
          message = body.error;
        }
      }
    } catch {
      // Not JSON: keep the general message.
    }
    throw new AssistantError(message, reason);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffered += value;
    const lines = buffered.split('\n');
    buffered = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim() !== '') {
        onEvent(JSON.parse(line) as AssistantEvent);
      }
    }
  }
  if (buffered.trim() !== '') {
    onEvent(JSON.parse(buffered) as AssistantEvent);
  }
}
