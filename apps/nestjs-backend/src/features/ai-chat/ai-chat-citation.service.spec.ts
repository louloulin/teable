/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from 'vitest';
import { AiChatCitationService } from './ai-chat-citation.service';

describe('AiChatCitationService (Stage 42)', () => {
  let svc: AiChatCitationService;

  beforeEach(() => {
    svc = new AiChatCitationService();
  });

  it('extracts base/table/view/field ids from text', () => {
    const text = 'See base bse9SHNH2rrWTD4CsYQ table tblLxvWC26Cyv08cotd view viwyZ4THdDNXpxOZiAb field fldC1cVMC6iExepjsna';
    const refs = svc.extract(text);
    const types = refs.map((r) => r.type).sort();
    expect(types).toEqual(['base', 'field', 'table', 'view']);
  });

  it('extracts record ids (long form)', () => {
    const text = 'Record rec1234567890abcdefghij is interesting';
    const refs = svc.extract(text);
    expect(refs.some((r) => r.type === 'record')).toBe(true);
  });

  it('deduplicates same id+type', () => {
    const refs = svc.extract('bse9SHNH2rrWTD4CsYQ and bse9SHNH2rrWTD4CsYQ');
    expect(refs).toHaveLength(1);
  });

  it('returns empty for text without ids', () => {
    expect(svc.extract('Hello world, no entities here.')).toEqual([]);
  });

  it('returns empty for empty text', () => {
    expect(svc.extract('')).toEqual([]);
  });

  it('resolves hrefs using session context', () => {
    const refs = svc.extract('See table tblLxvWC26Cyv08cotd and record rec1234567890abcdefghij');
    const resolved = svc.resolve(refs, {
      baseId: 'bse9SHNH2rrWTD4CsYQ',
      tableId: 'tblLxvWC26Cyv08cotd',
    });
    const table = resolved.find((r) => r.type === 'table')!;
    const record = resolved.find((r) => r.type === 'record')!;
    expect(table.href).toContain('/bse9SHNH2rrWTD4CsYQ/table/tblLxvWC26Cyv08cotd');
    expect(record.href).toContain('/bse9SHNH2rrWTD4CsYQ/table/tblLxvWC26Cyv08cotd/rec1234567890abcdefghij');
  });

  it('linkify wraps ids in markdown [id](href) syntax', () => {
    const out = svc.linkify(
      'See table tblLxvWC26Cyv08cotd',
      { baseId: 'bse1', tableId: 'tblOther' }
    );
    expect(out).toContain('[tblLxvWC26Cyv08cotd](/base/bse1/table/tblLxvWC26Cyv08cotd)');
  });

  it('linkify handles multiple distinct ids', () => {
    const out = svc.linkify(
      'base bse9SHNH2rrWTD4CsYQ table tblLxvWC26Cyv08cotd',
      { baseId: 'bse9SHNH2rrWTD4CsYQ', tableId: 'tblLxvWC26Cyv08cotd' }
    );
    expect(out).toMatch(/\[bse9SHNH2rrWTD4CsYQ\]\(\/base\/bse9SHNH2rrWTD4CsYQ\)/);
    expect(out).toMatch(/\[tblLxvWC26Cyv08cotd\]\(\/base\/bse9SHNH2rrWTD4CsYQ\/table\/tblLxvWC26Cyv08cotd\)/);
  });

  it('linkify returns empty string for empty input', () => {
    expect(svc.linkify('', { baseId: 'bse1' })).toBe('');
  });
});
