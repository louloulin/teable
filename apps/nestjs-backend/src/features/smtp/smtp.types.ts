/**
 * Built-in SMTP (Stage 19) — types.
 *
 * This is a deliberately small SMTP client. It supports the minimum
 * needed to send transactional email from automation rules:
 *
 *   - Plain TCP or opportunistic STARTTLS
 *   - LOGIN or PLAIN auth (when user/pass is provided)
 *   - One From + one To + many CC/BCC
 *   - Plain text and HTML bodies (multipart/alternative)
 *
 * No attachments, no DKIM, no chunking. Those belong in a follow-up
 * stage once the basic gateway proves out.
 */

export interface ISmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  /** Override the From address when the caller doesn't supply one. */
  from?: string;
  /** Connect timeout in milliseconds. */
  timeoutMs?: number;
  /** Enable STARTTLS upgrade. Defaults to true. */
  startTls?: boolean;
}

export interface ISendMailInput {
  from?: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}

export interface ISendMailResult {
  messageId: string;
  envelope: { from: string; to: string[] };
  /** True if the SMTP server returned 250 on the DATA end. */
  accepted: boolean;
}

/**
 * Pure function helper, exported for unit testing. Builds the RFC 5322
 * message body that goes into the DATA section. Returns the headers +
 * payload joined with CRLF, and the boundary used for multipart.
 */
export interface IBuildMessageParts {
  headers: string[];
  body: string;
  messageId: string;
}
