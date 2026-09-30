// Talks to a Granite admin as one person, with their personal API key
// (Settings -> AI Agents). Every request goes through the admin, never
// straight to a site: the admin holds each site's own token, checks the
// key's permission and the site's plan, and records what an agent
// changes as "Name (via AI agent)".

export class AdminError extends Error {
  readonly status: number;
  readonly reason: string | null;
  // A site's validation errors, field by field, when it refused a save.
  readonly errors: Array<{ path: string; message: string }>;

  constructor(status: number, message: string, reason: string | null, errors: Array<{ path: string; message: string }> = []) {
    super(message);
    this.name = 'AdminError';
    this.status = status;
    this.reason = reason;
    this.errors = errors;
  }
}

export interface AdminResponse {
  status: number;
  headers: Headers;
  text: string;
}

export interface AdminClientOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

// A content path ("pages/about.json") as real path segments.
export function encodePath(path: string): string {
  return path
    .replace(/^\/+/, '')
    .split('/')
    .map(encodeURIComponent)
    .join('/');
}

export class AdminClient {
  readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AdminClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async request(
    method: string,
    path: string,
    options: { json?: unknown; body?: BodyInit; headers?: Record<string, string> } = {},
  ): Promise<AdminResponse> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.apiKey}`, ...options.headers };
    let body = options.body;
    if (options.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.json);
    }
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, { method, headers, body });
    } catch (error) {
      throw new AdminError(0, `Could not reach the Granite admin at ${this.baseUrl}: ${error instanceof Error ? error.message : String(error)}`, 'unreachable');
    }
    const text = await response.text();
    if (!response.ok) {
      throw errorFrom(response.status, text);
    }
    return { status: response.status, headers: response.headers, text };
  }

  async json<T>(method: string, path: string, options: { json?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
    const response = await this.request(method, path, options);
    return (response.text === '' ? null : JSON.parse(response.text)) as T;
  }
}

function errorFrom(status: number, text: string): AdminError {
  let message = `The admin answered ${status}`;
  let reason: string | null = null;
  let errors: Array<{ path: string; message: string }> = [];
  try {
    const body = JSON.parse(text) as { message?: unknown; error?: unknown; reason?: unknown; errors?: unknown };
    // "message" is the specific reason; "error" is often just the status phrase.
    const specific = typeof body.message === 'string' ? body.message : typeof body.error === 'string' ? body.error : null;
    if (specific) {
      message = specific;
    }
    reason = typeof body.reason === 'string' ? body.reason : null;
    if (Array.isArray(body.errors)) {
      errors = body.errors.filter(
        (entry): entry is { path: string; message: string } =>
          typeof entry === 'object' && entry !== null && typeof entry.path === 'string' && typeof entry.message === 'string',
      );
    }
  } catch {
    // Not JSON: keep the status message.
  }
  return new AdminError(status, message, reason, errors);
}
