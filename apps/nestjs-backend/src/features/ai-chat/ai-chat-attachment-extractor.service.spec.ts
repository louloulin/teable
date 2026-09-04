import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { AiChatAttachmentExtractor, MAX_EXTRACT_CHARS } from './ai-chat-attachment-extractor.service';
import type { PrismaService } from '@teable/db-main-prisma';

interface FakeAttachmentRow {
  token: string;
  name: string;
  mimetype: string | null;
  size: number | null;
  path: string | null;
}

class FakePrisma {
  rows: FakeAttachmentRow[];
  constructor(rows: FakeAttachmentRow[]) {
    this.rows = rows;
  }
  get attachments() {
    return {
      findUnique: async ({ where }: { where: { token: string } }) => {
        return this.rows.find((r) => r.token === where.token) ?? null;
      },
    };
  }
}

const asPrisma = (fake: FakePrisma) => fake as unknown as PrismaService;

describe('AiChatAttachmentExtractor', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cuppy-attach-'));
  });

  afterAll(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty block for empty input', async () => {
    const ext = new AiChatAttachmentExtractor(asPrisma(new FakePrisma([])));
    expect(await ext.resolveToTextBlock([])).toBe('');
  });

  it('renders missing-attachment placeholder when token not in DB', async () => {
    const ext = new AiChatAttachmentExtractor(asPrisma(new FakePrisma([])));
    const out = await ext.resolveToTextBlock(['missing-xyz']);
    expect(out).toContain('<attachments>');
    expect(out).toContain('(missing attachment missing-xyz)');
    expect(out).toContain('</attachments>');
  });

  it('inlines text/plain content verbatim', async () => {
    const filePath = path.join(tmpDir, 'hello.txt');
    await fsp.writeFile(filePath, 'hello world\nline 2', 'utf8');
    const fake = new FakePrisma([
      { token: 'att-1', name: 'hello.txt', mimetype: 'text/plain', size: 19, path: filePath },
    ]);
    const ext = new AiChatAttachmentExtractor(asPrisma(fake));
    const out = await ext.resolveToTextBlock(['att-1']);
    expect(out).toContain('file="hello.txt"');
    expect(out).toContain('mime="text/plain"');
    expect(out).toContain('hello world');
    expect(out).toContain('line 2');
    expect(out).toContain('```');
  });

  it('treats application/json as textual', async () => {
    const filePath = path.join(tmpDir, 'data.json');
    await fsp.writeFile(filePath, '{"k":1}', 'utf8');
    const fake = new FakePrisma([
      { token: 'att-2', name: 'data.json', mimetype: 'application/json', size: 7, path: filePath },
    ]);
    const ext = new AiChatAttachmentExtractor(asPrisma(fake));
    const out = await ext.resolveToTextBlock(['att-2']);
    expect(out).toContain('{"k":1}');
    expect(out).not.toContain('binary');
  });

  it('renders binary placeholder for non-textual mime', async () => {
    const fake = new FakePrisma([
      {
        token: 'att-3',
        name: 'report.pdf',
        mimetype: 'application/pdf',
        size: 9001,
        path: '/nonexistent/report.pdf',
      },
    ]);
    const ext = new AiChatAttachmentExtractor(asPrisma(fake));
    const out = await ext.resolveToTextBlock(['att-3']);
    expect(out).toContain('file="report.pdf"');
    expect(out).toContain('application/pdf');
    // R-ATTACH-1: now goes through PdfParser which fails on missing file;
    // either we land on a graceful "parse failed" or the older
    // "content not parsed" hint depending on parser state.
    expect(out).toMatch(/file unreadable|parse failed|content not parsed/);
  });

  it('truncates overlong text and adds marker', async () => {
    const big = 'x'.repeat(MAX_EXTRACT_CHARS + 100);
    const filePath = path.join(tmpDir, 'big.txt');
    await fsp.writeFile(filePath, big, 'utf8');
    const fake = new FakePrisma([
      { token: 'att-4', name: 'big.txt', mimetype: 'text/plain', size: big.length, path: filePath },
    ]);
    const ext = new AiChatAttachmentExtractor(asPrisma(fake));
    const out = await ext.resolveToTextBlock(['att-4']);
    expect(out).toContain('[truncated to ' + MAX_EXTRACT_CHARS + ' chars]');
    // The inlined body block must not exceed MAX_EXTRACT_CHARS (the point of truncation).
    const bodyMatch = out.match(/```\n([\s\S]*?)\n\.\.\. \[truncated/);
    expect(bodyMatch).not.toBeNull();
    expect(bodyMatch![1].length).toBe(MAX_EXTRACT_CHARS);
  });

  it('reports read failure as inline warning, does not throw', async () => {
    const fake = new FakePrisma([
      {
        token: 'att-5',
        name: 'broken.txt',
        mimetype: 'text/plain',
        size: 1,
        path: '/nonexistent/path.txt',
      },
    ]);
    const ext = new AiChatAttachmentExtractor(asPrisma(fake));
    const out = await ext.resolveToTextBlock(['att-5']);
    expect(out).toContain('file="broken.txt"');
    expect(out).toMatch(/file unreadable|text extract failed/);
  });

  it('handles mixed text + binary batch', async () => {
    const filePath = path.join(tmpDir, 'mix.txt');
    await fsp.writeFile(filePath, 'plain content', 'utf8');
    const fake = new FakePrisma([
      { token: 'att-mix-1', name: 'mix.txt', mimetype: 'text/plain', size: 13, path: filePath },
      {
        token: 'att-mix-2',
        name: 'image.png',
        mimetype: 'image/png',
        size: 42,
        path: '/nope.png',
      },
    ]);
    const ext = new AiChatAttachmentExtractor(asPrisma(fake));
    const out = await ext.resolveToTextBlock(['att-mix-1', 'att-mix-2']);
    expect(out).toContain('plain content');
    // R-ATTACH-1: image PNG goes through Vision parser; with no OPENAI_API_KEY
    // the spec lands on `file unreadable` (the mocked path is missing).
    expect(out).toMatch(/binary|file unreadable|vision-missing-key/);
    expect(out).toContain('image.png');
    expect(out.indexOf('plain content')).toBeLessThan(out.indexOf('image.png'));
  });
});
