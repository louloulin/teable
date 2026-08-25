/**
 * Page Designer — Stage 28 types.
 *
 * A PageDefinition is a JSON tree of blocks composed into a
 * shareable "application surface" (Grid + Form + Kanban views
 * wrapped in headings, text, filter chips, buttons). Pages have
 * visibility modes ranging from fully public (link) to role-gated.
 */

export type PageBlockType = 'view' | 'heading' | 'text' | 'button' | 'filter' | 'divider' | 'image';

export type PageVisibility =
  | 'public'
  | 'link'
  | 'authenticated'
  | 'role:viewer'
  | 'role:editor'
  | 'role:admin'
  | 'role:owner';

export interface IPageBlockBase {
  id: string;
  type: PageBlockType;
  /** Order within the page. */
  order: number;
}

export interface IPageViewBlock extends IPageBlockBase {
  type: 'view';
  viewId: string;
  /** Optional inline filter override (record-level filter). */
  filter?: string;
}

export interface IPageHeadingBlock extends IPageBlockBase {
  type: 'heading';
  text: string;
  level: 1 | 2 | 3;
}

export interface IPageTextBlock extends IPageBlockBase {
  type: 'text';
  /** Plain text — keep it small to avoid heavy payloads. */
  text: string;
}

export interface IPageButtonBlock extends IPageBlockBase {
  type: 'button';
  label: string;
  /** Webhook URL to POST to when clicked. */
  webhookUrl?: string;
  /** Confirm prompt. */
  confirm?: string;
}

export interface IPageFilterBlock extends IPageBlockBase {
  type: 'filter';
  viewId: string;
  /** Visible filter chips (columnId → operator). */
  columns: string[];
}

export interface IPageDividerBlock extends IPageBlockBase {
  type: 'divider';
}

export interface IPageImageBlock extends IPageBlockBase {
  type: 'image';
  url: string;
  alt?: string;
}

export type IPageBlock =
  | IPageViewBlock
  | IPageHeadingBlock
  | IPageTextBlock
  | IPageButtonBlock
  | IPageFilterBlock
  | IPageDividerBlock
  | IPageImageBlock;

export interface IPageDefinition {
  id: string;
  baseId: string;
  name: string;
  slug: string;
  blocks: IPageBlock[];
  visibility: PageVisibility;
  theme: Record<string, string> | null;
  publishedAt: Date | null;
  createdBy: string;
  createdTime: Date;
  updatedTime: Date;
}

export interface IPageToken {
  id: string;
  pageId: string;
  token: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdTime: Date;
}

export interface ICreatePageInput {
  baseId: string;
  name: string;
  slug: string;
  blocks: IPageBlock[];
  visibility?: PageVisibility;
  theme?: Record<string, string> | null;
  createdBy: string;
}

export interface IUpdatePageInput {
  name?: string;
  slug?: string;
  blocks?: IPageBlock[];
  visibility?: PageVisibility;
  theme?: Record<string, string> | null;
}

export interface IResolvedVisibility {
  /** Whether the caller is allowed to view the page. */
  allowed: boolean;
  /** Why visibility was granted/denied. */
  reason:
    | 'public'
    | 'link-token'
    | 'authenticated'
    | 'role-match'
    | 'role-mismatch'
    | 'not-authenticated'
    | 'page-not-found';
}
