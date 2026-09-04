/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-ATTACH-1: file parser registry for AI Chat attachment extraction.
 *
 * Picks a parser based on the attachment's MIME type and returns a
 * normalized text payload. PDF / Excel / Word / Images are the four
 * priority formats from the Cloud §ai-chat §attachments roadmap.
 *
 * Parser priority and graceful fallback:
 *   - PDF (application/pdf)                       → pdf-parse
 *   - Excel (application/vnd.ms-excel, ...)       → xlsx (SheetJS)
 *   - Word (application/vnd.openxmlformats-...wordprocessingml.document, .docx) → mammoth (optional)
 *   - Image (image/png, image/jpeg, image/webp)   → OpenAI Vision (gpt-4o-mini)
 *   - Text (text/*, json, xml, yaml)              → utf-8 read
 *   - Unknown                                     → helpful hint
 *
 * Each parser is bound lazily so missing dependencies (e.g. mammoth
 * is not installed in OSS by default) produce a 200 with a hint
 * instead of crashing the chat turn.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Buffer } from 'node:buffer';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

export const MAX_PARSE_CHARS = 32_000;

export interface IParseInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface IParseResult {
  text: string;
  truncated: boolean;
  parser: string;
  meta?: Record<string, unknown>;
}

@Injectable()
export class AiChatAttachmentParserService {
  private readonly logger = new Logger(AiChatAttachmentParserService.name);
  private mammothModule: unknown = null;
  private mammothProbed: 'unknown' | 'absent' | 'present' = 'unknown';

  async parse(input: IParseInput): Promise<IParseResult> {
    const mime = (input.mimeType ?? '').toLowerCase();
    const filename = input.filename ?? 'file';

    if (mime.startsWith('text/') ||
        mime === 'application/json' ||
        mime === 'application/xml' ||
        mime === 'application/yaml' ||
        mime === 'application/x-yaml') {
      return this.parseText(input, filename, mime);
    }

    if (mime === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
      return this.parsePdf(input, filename, mime);
    }

    if (
      mime === 'application/vnd.ms-excel' ||
      mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mime === 'application/vnd.ms-excel.sheet.macroenabled.12' ||
      filename.toLowerCase().endsWith('.xls') ||
      filename.toLowerCase().endsWith('.xlsx')
    ) {
      return this.parseExcel(input, filename, mime);
    }

    if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mime === 'application/msword' ||
      filename.toLowerCase().endsWith('.docx') ||
      filename.toLowerCase().endsWith('.doc')
    ) {
      return this.parseWord(input, filename, mime);
    }

    if (mime.startsWith('image/')) {
      return this.parseImageWithVision(input, filename, mime);
    }

    return {
      text: `[unsupported attachment type: mime="${mime || 'unknown'}" filename="${filename}"]`,
      truncated: false,
      parser: 'unknown',
    };
  }

  // ── Text ─────────────────────────────────────────────────────────
  private async parseText(input: IParseInput, filename: string, mime: string): Promise<IParseResult> {
    const raw = input.buffer.toString('utf8');
    return this.normalize(raw, filename, mime, 'utf8');
  }

  // ── PDF ──────────────────────────────────────────────────────────
  private async parsePdf(input: IParseInput, filename: string, mime: string): Promise<IParseResult> {
    try {
      const pdfModule = await import('pdf-parse');
      const PDFParse = pdfModule.PDFParse;
      const parser = new PDFParse({ data: new Uint8Array(input.buffer) });
      try {
        const out = await parser.getText();
        const text = typeof out === 'object' && out && 'text' in out ? String(out.text) : JSON.stringify(out);
        const info = await parser.getInfo().catch(() => null);
        const result = this.normalize(text, filename, mime, 'pdf-parse');
        const meta: Record<string, unknown> = {};
        if (info && typeof info === 'object') meta.info = info;
        if (out && typeof out === 'object' && 'pages' in out) meta.numPages = Array.isArray((out as { pages?: unknown }).pages) ? (out as { pages: unknown[] }).pages.length : undefined;
        if (Object.keys(meta).length > 0) result.meta = { ...meta, filename: result.meta?.filename ?? filename, mime: result.meta?.mime ?? mime, originalLength: result.meta?.originalLength ?? text.length };
        return result;
      } finally {
        await parser.destroy().catch(() => undefined);
      }
    } catch (error) {
      this.logger.warn(`pdf-parse failed for ${filename}: ${(error as Error).message}`);
      return {
        text: `[pdf parse failed for ${filename}: ${(error as Error).message}]`,
        truncated: false,
        parser: 'pdf-parse',
      };
    }
  }

  // ── Excel ────────────────────────────────────────────────────────
  private async parseExcel(input: IParseInput, filename: string, mime: string): Promise<IParseResult> {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(input.buffer, { type: 'buffer' });
      const lines: string[] = [];
      let totalRows = 0;
      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        lines.push(`# Sheet: ${sheetName}`);
        lines.push(csv.trim());
        const rowCount = (sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null)
          ? (XLSX.utils.decode_range(sheet['!ref']!).e.r + 1) : 0;
        totalRows += rowCount;
        lines.push('');
      }
      const result = this.normalize(lines.join('\n'), filename, mime, 'xlsx');
      result.meta = { sheets: wb.SheetNames, rows: totalRows };
      return result;
    } catch (error) {
      this.logger.warn(`xlsx parse failed for ${filename}: ${(error as Error).message}`);
      return {
        text: `[xlsx parse failed for ${filename}: ${(error as Error).message}]`,
        truncated: false,
        parser: 'xlsx',
      };
    }
  }

  // ── Word ─────────────────────────────────────────────────────────
  private async parseWord(input: IParseInput, filename: string, mime: string): Promise<IParseResult> {
    // Lazy probe: avoid a hard dep on `mammoth` for OSS; degrade gracefully.
    if (this.mammothProbed === 'unknown') {
      try {
        // Mammoth is an optional peer dep — load via dynamic string to bypass tsc.
        const dynamicName = 'mammoth';
        const mod: any = await (Function('return import(arguments[0])')()(dynamicName));
        this.mammothModule = mod?.default ?? mod;
        this.mammothProbed = 'present';
      } catch {
        this.mammothModule = null;
        this.mammothProbed = 'absent';
      }
    }
    if (this.mammothProbed === 'absent') {
      return {
        text: `[word (.docx) extraction needs the optional 'mammoth' dependency — install with: pnpm add mammoth. File: ${filename} (${input.buffer.byteLength} bytes, ${mime}).]`,
        truncated: false,
        parser: 'mammoth-missing',
        meta: { installHint: 'pnpm add mammoth' },
      };
    }
    try {
      const mammoth: any = this.mammothModule as any;
      const { value } = await mammoth.extractRawText({ buffer: input.buffer });
      return this.normalize(value, filename, mime, 'mammoth');
    } catch (error) {
      return {
        text: `[mammoth parse failed for ${filename}: ${(error as Error).message}]`,
        truncated: false,
        parser: 'mammoth',
      };
    }
  }

  // ── Image (OpenAI Vision) ────────────────────────────────────────
  private async parseImageWithVision(input: IParseInput, filename: string, mime: string): Promise<IParseResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        text: `[image OCR skipped for ${filename}: OPENAI_API_KEY not configured. Install 'tesseract.js' for offline OCR or set OPENAI_API_KEY to enable OpenAI Vision.]`,
        truncated: false,
        parser: 'vision-missing-key',
        meta: { installHint: 'pnpm add tesseract.js', envHint: 'OPENAI_API_KEY' },
      };
    }

    const model = process.env.OPENAI_VISION_MODEL ?? 'gpt-4o-mini';
    const dataUrl = `data:${input.mimeType};base64,${input.buffer.toString('base64')}`;
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Describe the image concisely, including any on-screen text.' },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
          max_tokens: 1_000,
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        return {
          text: `[vision API returned ${response.status} for ${filename}: ${detail.slice(0, 200)}]`,
          truncated: false,
          parser: 'openai-vision',
        };
      }
      const payload = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      const text = payload.choices?.[0]?.message?.content ?? '';
      const result = this.normalize(text, filename, mime, 'openai-vision');
      result.meta = { model, usedKey: 'yes' };
      return result;
    } catch (error) {
      return {
        text: `[vision transport failed for ${filename}: ${(error as Error).message}]`,
        truncated: false,
        parser: 'openai-vision',
      };
    }
  }

  // ── helpers ──────────────────────────────────────────────────────
  private normalize(text: string, filename: string, mime: string, parser: string): IParseResult {
    const trimmed = text.length > MAX_PARSE_CHARS
      ? text.slice(0, MAX_PARSE_CHARS)
      : text;
    return {
      text: trimmed,
      truncated: text.length > MAX_PARSE_CHARS,
      parser,
      meta: { filename, mime, originalLength: text.length },
    };
  }

  // ── filesystem read helper (for callers that have a path, not buffer) ─
  async readBuffer(relativePath: string): Promise<Buffer> {
    const abs = path.isAbsolute(relativePath)
      ? relativePath
      : path.resolve(process.cwd(), relativePath);
    return await fsp.readFile(abs);
  }
}
