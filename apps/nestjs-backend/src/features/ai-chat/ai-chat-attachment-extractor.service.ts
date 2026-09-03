import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

export const MAX_EXTRACT_CHARS = 16_000;

@Injectable()
export class AiChatAttachmentExtractor {
  private readonly logger = new Logger(AiChatAttachmentExtractor.name);

  constructor(private readonly prisma: PrismaService) {}

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
    if (this.isTextualMime(mime)) {
      try {
        const text = await this.readText(row.path);
        const trimmed = text.length > MAX_EXTRACT_CHARS ? text.slice(0, MAX_EXTRACT_CHARS) : text;
        const suffix = text.length > MAX_EXTRACT_CHARS ? `\n... [truncated to ${MAX_EXTRACT_CHARS} chars]` : '';
        return `  - file="${fileName}" mime="${mimeStr}" bytes=${row.size ?? '?'}\n    \`\`\`\n${trimmed}${suffix}\n    \`\`\``;
      } catch (e) {
        this.logger.warn(`text extract failed for ${attachmentId}: ${(e as Error).message}`);
        return `  - file="${fileName}" mime="${mimeStr}" (text extract failed: ${(e as Error).message})`;
      }
    }
    return `  - file="${fileName}" mime="${mimeStr}" bytes=${row.size ?? '?'} (binary - content not parsed; please ask user for the relevant excerpt)`;
  }

  private isTextualMime(mime: string): boolean {
    return (
      mime.startsWith('text/') ||
      mime === 'application/json' ||
      mime === 'application/xml' ||
      mime === 'application/yaml' ||
      mime === 'application/x-yaml'
    );
  }

  private async readText(relativePath: string): Promise<string> {
    const abs = path.isAbsolute(relativePath) ? relativePath : path.resolve(process.cwd(), relativePath);
    return await fsp.readFile(abs, 'utf8');
  }
}
