/** Raw frontmatter as extracted from a markdown note body. */
export type RawFrontmatter = {
  text: string;
  fields: Record<string, RawFrontmatterValue>;
};

/** Raw frontmatter field values supported by the semantic frontmatter ingestion layer. */
export type RawFrontmatterValue = string | string[] | RawFrontmatterObject[];

/** Flat object used inside supported frontmatter arrays of objects. */
export type RawFrontmatterObject = Record<string, string>;

/**
 * Semantic frontmatter after tolerant ingestion and normalization.
 *
 * Operational logic must depend on this shape, never on raw frontmatter text.
 */
export type NormalizedSemanticFrontmatter = {
  title?: string;
  created?: string;
  updated?: string;
  category?: string;
  status?: string;
  project?: string;
  tags?: string[];
  aliases?: string[];
  summary?: string;
};

/** Parsed semantic frontmatter plus the note body after extraction. */
export type ParsedSemanticFrontmatterMarkdown = {
  rawFrontmatter: RawFrontmatter | null;
  frontmatter: NormalizedSemanticFrontmatter;
  body: string;
};

/** Markdown note payload loaded from disk (including fields parsed from frontmatter). */
export interface Note {
  title: string;
  content: string;
  filePath: string;
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
  aliases?: string[];
  status?: string;
  summary?: string;
  category?: string;
  project?: string;
}

/** Result of tolerant parsing; inspect `errors` for recoverable issues. */
export type SafeParseResult<T> = {
  data: T | null;
  errors: string[];
};
