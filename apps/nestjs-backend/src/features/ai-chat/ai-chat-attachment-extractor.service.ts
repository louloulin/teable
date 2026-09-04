import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { AiChatAttachmentParserService } from './ai-chat-attachment-parser.service';

export const MAX_EXTRACT_CHARS = 16_000;

@Injectable()
export class AiChatAttachmentExtractor {
  private readonly logger = new Logger(AiChatAttachmentExtractor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: AiChatAttachmentParserService = new AiChatAttachmentParserService(),
  ) {}

  async resolveToTextBlock(attachmentIds: string[]): Promise<string> {
    if (!attachmentIds.length) return '';
    const lines: string[] = ['<attachments>'];
    for (const id of attachmentIds) {
      lines.push(await this.resolveOne(id));
    }
    lines.push('</attachments>');
    return lines.join('\n');
  }

  private async resolveOne(attachmentId: string): Promise<string> {
    const row = await this.prisma.attachments
      .findUnique({
        where: { token: attachmentId },
        select: { token: true, mimetype: true, size: true, path: true },
      })
      .catch((e) => {
        this.logger.warn(`attachment lookup failed for ${attachmentId}: ${(e as Error).message}`);
        return null;
      });
    if (!row) return `  - (missing attachment ${attachmentId})`;
    const fileName =
      (row as typeof row & { name?: string }).name ?? path.basename(row.path) ?? row.token;
    const mime = (row.mimetype ?? '').toLowerCase();
    const mimeStr = row.mimetype ?? mime;
    let buffer: Buffer;
    try {
      buffer = await this.readText(row.path);
    } catch (e) {
      this.logger.warn(`read failed for ${attachmentId}: ${(e as Error).message}`);
      return `  - file="${fileName}" mime="${mimeStr}" (file unreadable: ${(e as Error).message})`;
    }
    try {
      const parsed = await this.parser.parse({
        buffer,
        filename: fileName,
        mimeType: mimeStr,
      });
      let body = parsed.text;
      let truncated = parsed.truncated;
      if (body.length > MAX_EXTRACT_CHARS) {
        body = body.slice(0, MAX_EXTRACT_CHARS);
        truncated = true;
      }
      const truncNote = truncated ? `\n... [truncated to ${MAX_EXTRACT_CHARS} chars]` : '';
      return `  - file="${fileName}" mime="${mimeStr}" bytes=${row.size ?? '?'} parser=${parsed.parser}\n    \`\`\`\n${body}${truncNote}\n    \`\`\``;
    } catch (e) {
      this.logger.warn(`parse failed for ${attachmentId}: ${(e as Error).message}`);
      return `  - file="${fileName}" mime="${mimeStr}" (parse failed: ${(e as Error).message})`;
    }
  }

  private async readText(relativePath: string): Promise<Buffer> {
    const abs = path.isAbsolute(relativePath) ? relativePath : path.resolve(process.cwd(), relativePath);
    return await fsp.readFile(abs);
  }
}
