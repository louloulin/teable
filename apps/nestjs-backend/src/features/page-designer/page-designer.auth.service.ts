import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  applyUpdate,
  buildPageRow,
  generatePageToken,
  hashPageToken,
  isTokenActive,
  parseBlocks,
  parseTheme,
  resolveVisibility,
  stringifyBlocks,
  stringifyTheme,
  validateCreateInput,
  verifyToken,
} from './page-designer.service';
import type {
  ICreatePageInput,
  IPageDefinition,
  IPageToken,
  IResolvedVisibility,
  IUpdatePageInput,
} from './page-designer.types';

/**
 * Page Designer orchestrator — Stage 28.
 *
 * CRUD over PageDefinition + link tokens for public access.
 * Visibility decisions go through `resolveVisibility`.
 */
@Injectable()
export class PageDesignerAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: ICreatePageInput): Promise<IPageDefinition> {
    const err = validateCreateInput(input);
    if (err) throw new BadRequestException(err);
    const existing = await this.prisma.pageDefinition.findUnique({ where: { slug: input.slug } });
    if (existing) throw new BadRequestException(`slug already in use: ${input.slug}`);
    const id = `pg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = buildPageRow({ ...input, id });
    const created = await this.prisma.pageDefinition.create({
      data: {
        id: row.id,
        baseId: row.baseId,
        name: row.name,
        slug: row.slug,
        blocksJson: stringifyBlocks(row.blocks),
        visibility: row.visibility,
        themeJson: stringifyTheme(row.theme),
        createdBy: row.createdBy,
      },
    });
    return toRow(created);
  }

  async update(id: string, update: IUpdatePageInput): Promise<IPageDefinition> {
    const existing = await this.prisma.pageDefinition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`page not found: ${id}`);
    if (update.slug && update.slug !== existing.slug) {
      const dup = await this.prisma.pageDefinition.findUnique({ where: { slug: update.slug } });
      if (dup) throw new BadRequestException(`slug already in use: ${update.slug}`);
    }
    if (update.blocks) {
      const { validateBlocks } = await import('./page-designer.service');
      const err = validateBlocks(update.blocks);
      if (err) throw new BadRequestException(err);
    }
    const merged = applyUpdate(toRow(existing), update);
    const updated = await this.prisma.pageDefinition.update({
      where: { id },
      data: {
        name: merged.name,
        slug: merged.slug,
        blocksJson: stringifyBlocks(merged.blocks),
        visibility: merged.visibility,
        themeJson: stringifyTheme(merged.theme),
      },
    });
    return toRow(updated);
  }

  async publish(id: string): Promise<IPageDefinition> {
    const updated = await this.prisma.pageDefinition.update({
      where: { id },
      data: { publishedAt: new Date() },
    });
    return toRow(updated);
  }

  async unpublish(id: string): Promise<IPageDefinition> {
    const updated = await this.prisma.pageDefinition.update({
      where: { id },
      data: { publishedAt: null },
    });
    return toRow(updated);
  }

  async delete(id: string): Promise<boolean> {
    await this.prisma.pageDefinition.delete({ where: { id } });
    await this.prisma.pageToken.deleteMany({ where: { pageId: id } });
    return true;
  }

  async get(id: string): Promise<IPageDefinition | null> {
    const row = await this.prisma.pageDefinition.findUnique({ where: { id } });
    return row ? toRow(row) : null;
  }

  async getBySlug(slug: string): Promise<IPageDefinition | null> {
    const row = await this.prisma.pageDefinition.findUnique({ where: { slug } });
    return row ? toRow(row) : null;
  }

  async list(input: { baseId?: string; limit?: number }): Promise<IPageDefinition[]> {
    const rows = await this.prisma.pageDefinition.findMany({
      where: input.baseId ? { baseId: input.baseId } : {},
      take: Math.min(input.limit ?? 100, 500),
      orderBy: { updatedTime: 'desc' },
    });
    return rows.map(toRow);
  }

  /** Issue a new link token for a `link`-visibility page. */
  async mintLinkToken(input: {
    pageId: string;
    ttlSeconds?: number;
  }): Promise<{ token: string; expiresAt: Date | null }> {
    const page = await this.prisma.pageDefinition.findUnique({ where: { id: input.pageId } });
    if (!page) throw new NotFoundException(`page not found: ${input.pageId}`);
    if (page.visibility !== 'link' && page.visibility !== 'public') {
      throw new BadRequestException('link tokens only apply to link/public pages');
    }
    const token = generatePageToken();
    const expiresAt =
      input.ttlSeconds && input.ttlSeconds > 0
        ? new Date(Date.now() + input.ttlSeconds * 1_000)
        : null;
    await this.prisma.pageToken.create({
      data: {
        id: `pgt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
        pageId: input.pageId,
        token: hashPageToken(token),
        expiresAt,
      },
    });
    return { token, expiresAt };
  }

  async revokeLinkToken(tokenId: string): Promise<boolean> {
    const existing = await this.prisma.pageToken.findUnique({ where: { id: tokenId } });
    if (!existing || existing.revokedAt) return false;
    await this.prisma.pageToken.update({ where: { id: tokenId }, data: { revokedAt: new Date() } });
    return true;
  }

  async listTokens(pageId: string): Promise<IPageToken[]> {
    const rows = await this.prisma.pageToken.findMany({ where: { pageId } });
    return rows.map(toTokenRow);
  }

  /** Resolve visibility for a public page request. */
  async resolve(input: {
    slug: string;
    caller: {
      authenticated: boolean;
      role: 'viewer' | 'editor' | 'admin' | 'owner' | null;
      presentedToken?: string;
    };
  }): Promise<{ page: IPageDefinition | null; visibility: IResolvedVisibility }> {
    const page = await this.getBySlug(input.slug);
    if (!page) return { page: null, visibility: { allowed: false, reason: 'page-not-found' } };
    let linkTokenValid = false;
    if (page.visibility === 'link' && input.caller.presentedToken) {
      const stored = await this.prisma.pageToken.findFirst({ where: { pageId: page.id } });
      linkTokenValid = !!(
        stored &&
        verifyToken(input.caller.presentedToken, stored.token) &&
        isTokenActive({ token: toTokenRow(stored) })
      );
    }
    return {
      page,
      visibility: resolveVisibility({ page, caller: { ...input.caller, linkTokenValid } }),
    };
  }
}

function toRow(r: {
  id: string;
  baseId: string;
  name: string;
  slug: string;
  blocksJson: string;
  visibility: string;
  themeJson: string | null;
  publishedAt: Date | null;
  createdBy: string;
  createdTime: Date;
  updatedTime: Date;
}): IPageDefinition {
  return {
    id: r.id,
    baseId: r.baseId,
    name: r.name,
    slug: r.slug,
    blocks: parseBlocks(r.blocksJson),
    visibility: r.visibility as IPageDefinition['visibility'],
    theme: parseTheme(r.themeJson),
    publishedAt: r.publishedAt,
    createdBy: r.createdBy,
    createdTime: r.createdTime,
    updatedTime: r.updatedTime,
  };
}

function toTokenRow(r: {
  id: string;
  pageId: string;
  token: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdTime: Date;
}): IPageToken {
  return {
    id: r.id,
    pageId: r.pageId,
    token: r.token,
    expiresAt: r.expiresAt,
    revokedAt: r.revokedAt,
    createdTime: r.createdTime,
  };
}

export { resolveVisibility, validateCreateInput, generatePageToken, hashPageToken };
