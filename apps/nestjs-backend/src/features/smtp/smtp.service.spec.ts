import { describe, expect, it } from 'vitest';
import { __test, SmtpService } from './smtp.service';
import type { ISendMailInput, ISmtpConfig } from './smtp.types';

const sampleConfig: ISmtpConfig = {
  host: 'mail.example.com',
  port: 587,
  user: 'apikey',
  pass: 'secret',
  from: 'no-reply@example.com',
  startTls: false,
};

describe('SmtpService helpers (Stage 19)', () => {
  it('parseAddress accepts bare email', () => {
    expect(__test.parseAddress('a@b.com')).toEqual({ name: '', address: 'a@b.com' });
  });

  it('parseAddress accepts display name + angle', () => {
    expect(__test.parseAddress('Alice <alice@example.com>')).toEqual({
      name: 'Alice',
      address: 'alice@example.com',
    });
  });

  it('parseAddress returns null for garbage', () => {
    expect(__test.parseAddress('not-an-email')).toBeNull();
  });

  it('ensureAddresses normalizes a comma list', () => {
    expect(__test.ensureAddresses('a@b.com, c@d.com')).toEqual(['a@b.com', 'c@d.com']);
  });

  it('ensureAddresses dedupes via filter on invalid entries', () => {
    expect(__test.ensureAddresses(['a@b.com', 'garbage'])).toEqual(['a@b.com']);
  });

  it('buildMessage produces multipart when text+html supplied', () => {
    const parts = __test.buildMessage(
      'from@x.com',
      { to: 'to@x.com', subject: 'subj', text: 'plain', html: '<p>x</p>' } as ISendMailInput,
      ['to@x.com'],
      [],
      'x.com'
    );
    expect(parts.headers.some((h) => h.startsWith('Content-Type: multipart/alternative'))).toBe(
      true
    );
    expect(parts.body).toContain('--');
    expect(parts.body).toContain('plain');
    expect(parts.body).toContain('<p>x</p>');
    expect(parts.messageId).toMatch(/^<.+@x\.com>$/);
  });

  it('buildMessage produces text/plain when only text supplied', () => {
    const parts = __test.buildMessage(
      'from@x.com',
      { to: 'to@x.com', subject: 'subj', text: 'hello' } as ISendMailInput,
      ['to@x.com'],
      [],
      'x.com'
    );
    expect(parts.headers.some((h) => h.startsWith('Content-Type: text/plain'))).toBe(true);
    expect(parts.body).toBe('hello');
  });

  it('buildMessage RFC-2047 encodes non-ASCII subjects', () => {
    const parts = __test.buildMessage(
      'from@x.com',
      { to: 'to@x.com', subject: '你好', text: 'x' } as ISendMailInput,
      ['to@x.com'],
      [],
      'x.com'
    );
    expect(parts.headers.find((h) => h.startsWith('Subject:'))).toMatch(/=\?utf-8\?B\?/);
  });

  it('readReply decodes single-line reply', () => {
    const { code, lines } = __test.readReply(Buffer.from('250 OK\r\n'));
    expect(code).toBe(250);
    expect(lines).toEqual(['250 OK']);
  });

  it('readReply handles multi-line continuation', () => {
    const { code, lines } = __test.readReply(
      Buffer.from('250-SIZE 10240000\r\n250-8BITMIME\r\n250 STARTTLS\r\n')
    );
    expect(code).toBe(250);
    expect(lines).toHaveLength(3);
  });

  it('readReply returns code=0 for incomplete buffer', () => {
    const { code } = __test.readReply(Buffer.from('250-SIZE\r\n'));
    expect(code).toBe(0);
  });
});

describe('SmtpService.sendMail (Stage 19)', () => {
  it('rejects when no to addresses', async () => {
    const svc = SmtpService.withFactory(() => {
      /* never called */
    });
    await expect(svc.sendMail(sampleConfig, { to: [], subject: 'x' } as never)).rejects.toThrow(
      /to address required/
    );
  });

  it('rejects when from missing and config has none', async () => {
    const svc = SmtpService.withFactory(() => undefined);
    await expect(
      svc.sendMail({ host: 'h', port: 25 }, { to: 'a@b.com', subject: 'x', text: 'y' })
    ).rejects.toThrow(/from address required/);
  });

  it('drives EHLO/MAIL/RCPT/DATA/QUIT against a fake socket', { timeout: 15000 }, async () => {
    const sent: string[] = [];
    const replies: string[] = [
      '220 mx ready\r\n',
      '250-mx hello\r\n250 AUTH LOGIN\r\n',
      '334 VXNlcm5hbWU6\r\n',
      '334 UGFzc3dvcmQ6\r\n',
      '235 ok\r\n',
      '250 sender ok\r\n',
      '250 recipient ok\r\n',
      '250 recipient ok\r\n',
      '354 send data\r\n',
      '250 ok queued\r\n',
      '221 bye\r\n',
    ];
    let rIdx = 0;
    const fake = {
      write(d: string) {
        sent.push(d.trim());
        return true;
      },
      on() {
        /* no events */
      },
      destroy() {
        /* noop */
      },
    };
    const svc = SmtpService.withFactory((_cfg, onSocket, _onErr) => {
      // Push replies asynchronously so the session can drain them.
      const push = () => {
        if (rIdx >= replies.length) return;
        const chunk = Buffer.from(replies[rIdx++]);
        const ev = handlers.get('data');
        if (ev) ev(chunk);
        setTimeout(push, 5);
      };
      const handlers = new Map<string, (chunk: Buffer) => void>();
      const wrapped = {
        write: fake.write,
        on: (e: string, cb: (chunk: Buffer) => void) => {
          handlers.set(e, cb);
          if (e === 'connect') {
            // Fire connect immediately so open() resolves, then schedule
            // the first reply push.
            setTimeout(() => {
              const c = handlers.get('connect');
              if (c) c();
              setTimeout(push, 0);
            }, 0);
          }
        },
        destroy: fake.destroy,
      };
      onSocket(wrapped);
    });
    const result = await svc.sendMail(sampleConfig, {
      to: 'alice@example.com, bob@example.com',
      subject: 'Hello',
      text: 'Hi there',
    });
    expect(result.accepted).toBe(true);
    expect(result.envelope.to).toEqual(['alice@example.com', 'bob@example.com']);
    expect(sent.some((s) => s.startsWith('EHLO'))).toBe(true);
    expect(sent.some((s) => s.startsWith('MAIL FROM:<no-reply@example.com>'))).toBe(true);
    expect(sent.filter((s) => s.startsWith('RCPT TO:<')).length).toBe(2);
    expect(sent.some((s) => s.startsWith('DATA'))).toBe(true);
    expect(sent.some((s) => s === 'QUIT')).toBe(true);
  });
});
