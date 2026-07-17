import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../../config/config';
import { logger } from '../logger/logger';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailPort {
  send(message: MailMessage): Promise<void>;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!config.mail.smtpHost) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.mail.smtpHost,
      port: config.mail.smtpPort,
      secure: config.mail.smtpSecure,
      auth:
        config.mail.smtpUser && config.mail.smtpPass
          ? { user: config.mail.smtpUser, pass: config.mail.smtpPass }
          : undefined,
    });
  }
  return transporter;
}

/**
 * Production mailer: SMTP when configured; otherwise log the message.
 * In production without SMTP we still log loudly so ops notices misconfig,
 * but forgot-password never fails open with a leaked token.
 */
export const mailer: MailPort = {
  async send(message: MailMessage): Promise<void> {
    const from = config.mail.from;
    const transport = getTransporter();

    if (!transport) {
      const level = config.isProd ? 'warn' : 'info';
      logger[level](
        {
          to: message.to,
          subject: message.subject,
          text: message.text,
          hint: config.isProd
            ? 'SMTP not configured — set SMTP_HOST (and related vars) to deliver mail'
            : 'Dev mail sink (no SMTP) — message logged instead of sent',
        },
        'mail.send',
      );
      return;
    }

    await transport.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html ?? message.text,
    });
    logger.info({ to: message.to, subject: message.subject }, 'mail.sent');
  },
};

/** Build the password-reset email body. */
export function passwordResetEmail(to: string, resetToken: string): MailMessage {
  const link = `${config.appUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(resetToken)}`;
  return {
    to,
    subject: 'Reset your FinPay password',
    text: [
      'You requested a password reset for your FinPay account.',
      '',
      `Open this link to choose a new password (expires in 1 hour):`,
      link,
      '',
      'If you did not request this, you can ignore this email.',
    ].join('\n'),
    html: `
      <p>You requested a password reset for your <strong>FinPay</strong> account.</p>
      <p><a href="${link}">Choose a new password</a></p>
      <p style="color:#64748b;font-size:13px">This link expires in 1 hour. If you did not request this, ignore this email.</p>
    `,
  };
}
