import { env } from '../config/env.js';
import { logger } from './logger.js';

export interface Email {
  to: string;
  subject: string;
  text: string;
}

const RESEND_URL = 'https://api.resend.com/emails';

/**
 * Sends through Resend's REST API (plain fetch, no SDK). Returns false instead of throwing:
 * the caller has already saved its write, and the owner can still copy the link (ADR 015).
 * Without RESEND_API_KEY the email is skipped. The body is never logged, because invite
 * emails carry a token.
 */
export async function sendEmail(email: Email): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    logger.info({ subject: email.subject }, 'email skipped: RESEND_API_KEY is not set');
    return false;
  }
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: env.EMAIL_FROM, ...email }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.error({ status: res.status, subject: email.subject }, 'email rejected by Resend');
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err, subject: email.subject }, 'email send failed');
    return false;
  }
}
