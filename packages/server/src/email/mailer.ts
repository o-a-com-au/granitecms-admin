import nodemailer from 'nodemailer';
import type { SmtpConfig } from '../config.ts';

export interface Mailer {
  sendInviteEmail(input: { to: string; siteUrl: string; claimUrl: string; expiresAt: string }): Promise<void>;
}

// Generic SMTP, not a specific provider's SDK - works against any SMTP
// endpoint (a real provider's SMTP relay, or a local dev catcher)
// without vendor lock-in, matching this admin's self-hosted framing.
// Hand-rolling SMTP (MIME encoding, TLS/STARTTLS negotiation, auth
// mechanisms) isn't something to write from scratch - the one new
// dependency this feature needs.
//
// Unconfigured (config undefined) returns undefined, not a stub that
// throws - routes/site-invites.ts treats "no mailer" as a first-class
// state (falls back to showing the developer the raw link), never a
// hard failure.
export function createMailer(config: SmtpConfig | undefined): Mailer | undefined {
  if (!config) {
    return undefined;
  }

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.password },
  });

  return {
    async sendInviteEmail({ to, siteUrl, claimUrl, expiresAt }) {
      const expiresLabel = new Date(expiresAt).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      await transport.sendMail({
        from: config.from,
        to,
        subject: `You've been invited to manage ${siteUrl}`,
        text: `You've been invited to manage ${siteUrl}.\n\nGet started: ${claimUrl}\n\nThis link expires ${expiresLabel}.`,
        html: `<p>You've been invited to manage <strong>${siteUrl}</strong>.</p><p><a href="${claimUrl}">Get started</a></p><p>This link expires ${expiresLabel}.</p>`,
      });
    },
  };
}
