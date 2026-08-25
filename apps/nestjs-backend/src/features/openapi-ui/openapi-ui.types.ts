/**
 * OpenAPI UI — types (Stage 106).
 */

export interface IExplorerSection {
  /** Section heading, e.g. "Operations". */
  heading: string;
  /** Body markup (sanitized HTML fragment). */
  body: string;
}

export interface IExplorerPage {
  /** Document title (h1). */
  title: string;
  /** Document version. */
  version: string;
  /** Path to the JSON file the UI fetches. */
  jsonPath: string;
  /** Page sections. */
  sections: IExplorerSection[];
}

export interface IRenderedEndpoint {
  /** operationId. */
  id: string;
  /** HTTP verb. */
  verb: string;
  /** Full URL path. */
  path: string;
  /** Whether auth is required. */
  authRequired: boolean;
  /** Short summary. */
  summary: string;
  /** Inline markup (li). */
  markup: string;
}

export interface IRenderedHeader {
  title: string;
  version: string;
  jsonPath: string;
  markup: string;
}

export const MAX_UI_SECTIONS = 16;
export const MAX_UI_ENDPOINT_BYTES = 4096;
