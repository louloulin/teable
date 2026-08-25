import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as net from 'net';
import * as tls from 'tls';
import { createHash, randomBytes } from 'crypto';

import { IBuildMessageParts, ISendMailInput, ISendMailResult, ISmtpConfig } from './smtp.types';

const CRLF = '\r\n';
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Parse a single RFC 5322 address into "display <local@host>".
 * Accepts bare "local@host" too. Returns null if neither form is found.
 */
const parseAddress = (raw: string): { name: string; address: string } | null => {
  const s = raw.trim();
  const m = s.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/) ?? null;
  if (m) {
    return { name: m[1].replace(/^"|"$/g, '').trim(), address: m[2].trim() };
  }
  if (/^[^\s@]+@[^\s@]+$/.test(s)) return { name: '', address: s };
  return null;
};

const ensureAddresses = (raw: string | string[] | undefined): string[] => {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : raw.split(',');
  return list.map((s) => parseAddress(s)?.address).filter((a): a is string => Boolean(a));
};

const buildMessage = (
  from: string,
  input: ISendMailInput,
  to: string[],
  cc: string[],
  envDomain: string
): IBuildMessageParts => {
  const messageId = `<${Date.now().toString(36)}.${randomBytes(6).toString('hex')}@${envDomain}>`;
  const date = new Date().toUTCString();
  const boundary = `mixed_${randomBytes(8).toString('hex')}`;
  const headers: string[] = [
    `Message-ID: ${messageId}`,
    `Date: ${date}`,
    `From: ${from}`,
    `To: ${to.join(', ')}`,
  ];
  if (cc.length) headers.push(`Cc: ${cc.join(', ')}`);
  if (input.replyTo) headers.push(`Reply-To: ${input.replyTo}`);
  headers.push(`Subject: ${encodeRFC2047(input.subject)}`);
  headers.push('MIME-Version: 1.0');

  if (input.text && input.html) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    const body = [
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      input.text,
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      input.html,
      `--${boundary}--`,
      '',
    ].join(CRLF);
    return { headers, body, messageId };
  }

  if (input.html) {
    headers.push('Content-Type: text/html; charset=utf-8');
    return { headers, body: input.html, messageId };
  }
  headers.push('Content-Type: text/plain; charset=utf-8');
  return { headers, body: input.text ?? '', messageId };
};

const encodeRFC2047 = (s: string): string => {
  // Only ASCII-safe short subjects are kept verbatim; otherwise encode as
  // =?utf-8?B?<base64>?= per RFC 2047.
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  return `=?utf-8?B?${Buffer.from(s, 'utf-8').toString('base64')}?=`;
};

/**
 * Read a single SMTP reply line. The protocol is a 3-digit code, optional
 * space+dash for continuation, and the line ending with CRLF.
 *
 * We consume only the first complete reply sequence: a contiguous run of
 * lines that all start with the same 3-digit code, terminated by a line
 * whose separator after the code is a space (not a dash). Any subsequent
 * reply stays in `rest` for the next call.
 */
const readReply = (buf: Buffer): { code: number; lines: string[]; rest: Buffer } => {
  const text = buf.toString('utf-8');
  const lines = text.split(CRLF);
  if (lines.length === 0) return { code: 0, lines: [], rest: buf };
  // Validate the first line carries a reply code at all.
  const firstMatch = /^(\d{3})([ -])/.exec(lines[0]);
  if (!firstMatch) return { code: 0, lines: [], rest: buf };
  const expectedCode = firstMatch[1];
  let lastIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\d{3})([ -])/.exec(lines[i]);
    if (!m) continue;
    if (m[1] !== expectedCode) break;
    if (m[2] === ' ') {
      lastIdx = i;
      break;
    }
    lastIdx = i;
  }
  if (lastIdx === 0 && firstMatch[2] !== ' ') {
    // First line is a continuation (e.g. "250-") without a terminating
    // space line yet → incomplete buffer.
    return { code: 0, lines: [], rest: buf };
  }
  const code = Number(expectedCode);
  const consumed = lines.slice(0, lastIdx + 1).join(CRLF) + CRLF;
  const rest = buf.slice(consumed.length);
  return { code, lines: lines.slice(0, lastIdx + 1), rest };
};

export interface ISocketLike {
  write(data: string): boolean;
  on(event: 'data', cb: (chunk: Buffer) => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  on(event: 'close', cb: () => void): void;
  on(event: 'connect', cb: () => void): void;
  destroy(): void;
}

export interface ICreateConnection {
  (config: ISmtpConfig, onSocket: (s: ISocketLike) => void, onError: (e: Error) => void): void;
}

/**
 * SMTP service. The actual TCP socket is created via a small factory
 * (default = Node net/tls) so tests can substitute a fake. sendMail
 * is the only public method; the lower-level pieces are exposed
 * (parseAddress, buildMessage, readReply) via the same module exports
 * for unit tests but never via the HTTP layer.
 */
@Injectable()
export class SmtpService {
  private readonly logger = new Logger(SmtpService.name);
  private readonly createConnection: ICreateConnection;

  constructor() {
    this.createConnection = defaultCreateConnection;
  }

  /** Test-only constructor. */
  static withFactory(factory: ICreateConnection): SmtpService {
    const svc = new SmtpService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (svc as unknown as { createConnection: ICreateConnection }).createConnection = factory;
    return svc;
  }

  async sendMail(config: ISmtpConfig, input: ISendMailInput): Promise<ISendMailResult> {
    const to = ensureAddresses(input.to);
    if (to.length === 0) {
      throw new BadRequestException('to address required');
    }
    const cc = ensureAddresses(input.cc);
    const bcc = ensureAddresses(input.bcc);
    const fromRaw = input.from ?? config.from;
    if (!fromRaw) {
      throw new BadRequestException('from address required (in body or config)');
    }
    const from = parseAddress(fromRaw)?.address ?? fromRaw;
    const envDomain = config.host.split('.').slice(-2).join('.') || config.host;
    const parts = buildMessage(from, input, to, cc, envDomain);
    const fullTo = [...to, ...cc, ...bcc];

    const session = new SmtpSession(config, this.logger, this.createConnection);
    try {
      await session.execute(parts, { from, to: fullTo, config });
    } finally {
      session.close();
    }
    return {
      messageId: parts.messageId,
      envelope: { from, to: fullTo },
      accepted: session.accepted,
    };
  }
}

class SmtpSession {
  accepted = false;
  private buffer = Buffer.alloc(0);
  private resolve: ((v: number) => void) | null = null;
  private socket: ISocketLike | null = null;

  constructor(
    private readonly config: ISmtpConfig,
    private readonly logger: Logger,
    private readonly factory: ICreateConnection
  ) {}

  async execute(
    parts: IBuildMessageParts,
    ctx: { from: string; to: string[]; config: ISmtpConfig }
  ): Promise<void> {
    await this.open();
    await this.expect(220, null, `EHLO ${ctx.config.host}`);
    // Try STARTTLS if requested and the server advertised it. We always
    // do this when user/pass is set, because we won't AUTH in cleartext.
    const caps = await this.expect(250, null, null);
    const useStartTls = (ctx.config.startTls ?? true) && caps.some((l) => /^STARTTLS\b/.test(l));
    if (useStartTls) {
      await this.expect(220, null, 'STARTTLS');
      await this.upgradeTls();
      await this.expect(250, null, `EHLO ${ctx.config.host}`);
    }
    if (ctx.config.user && ctx.config.pass) {
      await this.expect(334, null, 'AUTH LOGIN');
      await this.expect(334, null, Buffer.from(ctx.config.user, 'utf-8').toString('base64'));
      await this.expect(235, null, Buffer.from(ctx.config.pass, 'utf-8').toString('base64'));
    }
    await this.expect(250, null, `MAIL FROM:<${ctx.from}>`);
    for (const t of ctx.to) {
      await this.expect(250, null, `RCPT TO:<${t}>`);
    }
    await this.expect(354, null, 'DATA');
    const data = [...parts.headers, '', parts.body, '.', ''].join(CRLF);
    await this.expect(250, null, data);
    await this.expect(221, null, 'QUIT');
    this.accepted = true;
  }

  close(): void {
    try {
      this.socket?.destroy();
    } catch {
      /* ignore */
    }
  }

  private open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('smtp connect timeout')),
        this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS
      );
      this.factory(
        this.config,
        (s) => {
          this.socket = s;
          clearTimeout(timer);
          s.on('data', (chunk) => {
            this.buffer = Buffer.concat([this.buffer, chunk]);
            if (this.resolve) {
              const { code, lines, rest } = readReply(this.buffer);
              if (code !== 0) {
                this.buffer = rest;
                const r = this.resolve;
                this.resolve = null;
                r(code === 0 ? -1 : code);
                void lines;
              }
            }
          });
          s.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
          });
          s.on('close', () => {
            if (this.resolve) {
              const r = this.resolve;
              this.resolve = null;
              r(-1);
            }
          });
          s.on('connect', () => resolve());
          // If the factory resolves before 'connect' fires, the timer is
          // already cleared; resolve will be picked up by 'connect'.
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  private upgradeTls(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('no socket'));
      // Replace the plaintext socket with a TLS one. We keep using the
      // same protocol exchange via the new socket.
      const old = this.socket;
      const host = this.config.host;
      const port = this.config.port;
      const tlsSocket = tls.connect({ host, port, servername: host }, () => resolve());
      tlsSocket.on('error', reject);
      // For tests + simplicity, the new socket shares the buffer/resolve
      // machinery via the same delegate object.
      const newSock: ISocketLike = {
        write: (d) => tlsSocket.write(d),
        on: (e, cb) =>
          tlsSocket.on(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            e as any,
            cb as (...args: unknown[]) => void
          ),
        destroy: () => tlsSocket.destroy(),
      };
      try {
        old.destroy();
      } catch {
        /* ignore */
      }
      this.socket = newSock;
      this.buffer = Buffer.alloc(0);
    });
  }

  private expect(
    okCode: number,
    failCode: number | null,
    command: string | null
  ): Promise<string[]> {
    if (command !== null) {
      this.socket?.write(command + CRLF);
    }
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        const { code, lines, rest } = readReply(this.buffer);
        if (code !== 0) {
          this.buffer = rest;
          if (code === okCode) {
            resolve(lines);
          } else if (failCode !== null && code === failCode) {
            resolve(lines);
          } else {
            reject(new Error(`smtp ${code} (want ${okCode}): ${lines.join(' | ')}`));
          }
          return;
        }
        if (Date.now() - start > (this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS)) {
          reject(new Error(`smtp timeout waiting for ${okCode}`));
          return;
        }
        setTimeout(tick, 25);
      };
      tick();
    });
  }
}

const defaultCreateConnection: ICreateConnection = (config, onSocket, onError) => {
  const socket = net.connect({ host: config.host, port: config.port }, () => {
    onSocket({
      write: (d) => socket.write(d),
      on: (e, cb) =>
        socket.on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          e as any,
          cb as (...args: unknown[]) => void
        ),
      destroy: () => socket.destroy(),
    });
  });
  socket.on('error', onError);
};

// --- helpers re-exported for testing ---

export const __test = {
  parseAddress,
  ensureAddresses,
  buildMessage,
  readReply,
  encodeRFC2047,
  createHash,
  randomBytes,
};
