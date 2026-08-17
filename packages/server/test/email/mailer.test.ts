import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server, type Socket } from 'node:net';
import { createMailer } from '../../src/email/mailer.ts';
import type { SmtpConfig } from '../../src/config.ts';

let fakeSmtpServer: Server | undefined;

afterEach(async () => {
  if (fakeSmtpServer) {
    await new Promise<void>((resolve) => fakeSmtpServer!.close(() => resolve()));
    fakeSmtpServer = undefined;
  }
});

// A real, minimal SMTP responder over a raw TCP socket, not a mock of
// nodemailer - exercises createMailer's actual transport end to end,
// matching this codebase's own "empirical over mocked" bias
// (test/routes/sites.test.ts's startFakeSite is the HTTP-side
// precedent). No AUTH mechanism is advertised in the EHLO response -
// nodemailer only attempts authentication when the server declares
// support for it, so this keeps the hand-rolled protocol surface to
// exactly what's needed to accept one message: EHLO, MAIL FROM,
// RCPT TO, DATA, and the message body up to the terminating "." line.
function startFakeSmtpServer(): Promise<{ port: number; receivedMessages: () => string[] }> {
  const messages: string[] = [];

  const server = createServer((socket: Socket) => {
    socket.write('220 localhost ESMTP\r\n');
    let buffer = '';
    let inData = false;
    let currentLines: string[] = [];

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf-8');
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 2);

        if (inData) {
          if (line === '.') {
            inData = false;
            messages.push(currentLines.join('\n'));
            currentLines = [];
            socket.write('250 OK queued\r\n');
          } else {
            currentLines.push(line);
          }
          continue;
        }

        const upper = line.toUpperCase();
        if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
          socket.write('250 localhost\r\n');
        } else if (upper === 'DATA') {
          inData = true;
          socket.write('354 Start mail input\r\n');
        } else if (upper === 'QUIT') {
          socket.write('221 Bye\r\n');
          socket.end();
        } else {
          // MAIL FROM / RCPT TO / anything else this minimal fixture
          // doesn't need to distinguish.
          socket.write('250 OK\r\n');
        }
      }
    });
  });

  fakeSmtpServer = server;

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        throw new Error('expected a real listening address');
      }
      resolve({ port: address.port, receivedMessages: () => messages });
    });
  });
}

describe('createMailer', () => {
  it('returns undefined when unconfigured, without attempting any network activity', () => {
    const mailer = createMailer(undefined);
    assert.equal(mailer, undefined);
  });

  it('sendInviteEmail delivers a real message over SMTP to the configured server', async () => {
    const { port, receivedMessages } = await startFakeSmtpServer();
    const config: SmtpConfig = { host: '127.0.0.1', port, user: 'unused', password: 'unused', from: 'invites@example.test' };
    const mailer = createMailer(config);
    assert.ok(mailer, 'expected createMailer to return a real mailer when configured');

    await mailer.sendInviteEmail({
      to: 'client@example.test',
      siteUrl: 'https://client-one.example.com',
      claimUrl: 'https://admin.example.com/invite/abc123',
      expiresAt: '2026-08-24T00:00:00.000Z',
    });

    const [message] = receivedMessages();
    assert.ok(message, 'expected the fake SMTP server to have received a message');
    assert.match(message, /To: client@example\.test/);
    assert.match(message, /From: invites@example\.test/);
    assert.match(message, /client-one\.example\.com/);
    assert.match(message, /admin\.example\.com\/invite\/abc123/);
  });
});
