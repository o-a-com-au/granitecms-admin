import Anthropic from '@anthropic-ai/sdk';

// The Claude model the assistant runs on (agreed: Sonnet, for speed and
// cost per task; change it here).
export const ASSISTANT_MODEL = 'claude-sonnet-5-5';
const MAX_TOKENS = 8192;

export interface AssistantModelRequest {
  system: string;
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
}

// One call to Claude: streams its text as it's written (onText), then
// resolves with the whole reply, including any tool calls. An interface
// so tests run against a fake and never call (or pay for) the real API.
export interface AssistantModel {
  send(request: AssistantModelRequest, onText: (text: string) => void, signal?: AbortSignal): Promise<Anthropic.Message>;
}

export function createAnthropicModel(apiKey: string): AssistantModel {
  const client = new Anthropic({ apiKey });
  return {
    async send(request, onText, signal) {
      const stream = client.messages.stream(
        {
          model: ASSISTANT_MODEL,
          max_tokens: MAX_TOKENS,
          // The instructions and tools are the same on every call of a
          // conversation, so they're cached rather than paid for in full
          // each time.
          system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
          tools: request.tools,
          messages: request.messages,
        },
        { signal },
      );
      stream.on('text', onText);
      return stream.finalMessage();
    },
  };
}

// A failed call, in words the person can act on. The SDK has already
// retried what's worth retrying by the time this is reached.
export function describeModelError(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    if (error.status === 429) {
      return 'The assistant is busy right now. Try again in a minute.';
    }
    if (error.status === 529 || (error.status !== undefined && error.status >= 500)) {
      return 'The assistant is unavailable right now. Try again shortly.';
    }
    if (error.status === 401 || error.status === 403) {
      return "The assistant isn't set up correctly on this admin (its API key was refused).";
    }
  }
  return 'Something went wrong with the assistant. Try again.';
}
