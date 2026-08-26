/* eslint-disable @typescript-eslint/naming-convention */
import { MailSenderAuthService } from './mail-sender.auth.service';
import { formatMailAddress, validateMailEnvelope } from './mail-sender.helpers';

describe('MailSenderAuthService (thin-DI wrapper)', () => {
  const svc = new MailSenderAuthService();

  it('validate returns null for a well-formed envelope', () => {
    expect(
      svc.validate({
        from: { email: 'noreply@example.com' },
        to: [{ email: 'a@example.com' }],
        subject: 'Hi',
        html: '<p>hi</p>',
      })
    ).toBeNull();
  });

  it('validate reports missing recipients', () => {
    expect(
      svc.validate({
        from: { email: 'noreply@example.com' },
        to: [],
        subject: 'Hi',
        html: '<p>hi</p>',
      })
    ).toBe('no-recipients');
  });

  it('validate reports missing subject', () => {
    expect(
      svc.validate({
        from: { email: 'noreply@example.com' },
        to: [{ email: 'a@example.com' }],
        subject: '   ',
        html: '<p>hi</p>',
      })
    ).toBe('missing-subject');
  });
});

describe('mail-sender helpers', () => {
  it('formatMailAddress includes the name when provided', () => {
    expect(formatMailAddress('a@example.com')).toBe('a@example.com');
    expect(formatMailAddress('a@example.com', 'Alice')).toBe('Alice <a@example.com>');
    expect(formatMailAddress('  a@example.com  ', '  Alice ')).toBe('Alice <a@example.com>');
  });

  it('validateMailEnvelope flags missing body', () => {
    expect(
      validateMailEnvelope({
        from: { email: 'a@example.com' },
        to: [{ email: 'b@example.com' }],
        subject: 's',
        html: '',
        text: '',
      })
    ).toBe('missing-body');
  });
});