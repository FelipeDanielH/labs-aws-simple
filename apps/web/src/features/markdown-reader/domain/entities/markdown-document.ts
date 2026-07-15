export type MarkdownDocument = {
  name: string;
  size: number;
  mimeType: string;
  source: string;
  blocks: MarkdownBlock[];
};

export type MarkdownBlock =
  | MarkdownHeading
  | MarkdownParagraph
  | MarkdownBlockquote
  | MarkdownList
  | MarkdownCodeBlock
  | MarkdownThematicBreak
  | MarkdownTable
  | MarkdownUnsupportedBlock;

export type MarkdownInline =
  | MarkdownText
  | MarkdownEmphasis
  | MarkdownStrong
  | MarkdownDelete
  | MarkdownInlineCode
  | MarkdownLink
  | MarkdownImage
  | MarkdownBreak
  | MarkdownUnsupportedInline;

export type MarkdownHeading = {
  type: "heading";
  depth: 1 | 2 | 3 | 4 | 5 | 6;
  children: MarkdownInline[];
};

export type MarkdownParagraph = {
  type: "paragraph";
  children: MarkdownInline[];
};

export type MarkdownBlockquote = {
  type: "blockquote";
  children: MarkdownBlock[];
};

export type MarkdownList = {
  type: "list";
  ordered: boolean;
  start: number | null;
  items: MarkdownListItem[];
};

export type MarkdownListItem = {
  type: "list-item";
  checked: boolean | null;
  children: MarkdownBlock[];
};

export type MarkdownCodeBlock = {
  type: "code";
  language: string | null;
  meta: string | null;
  value: string;
};

export type MarkdownThematicBreak = { type: "thematic-break" };

export type MarkdownTable = {
  type: "table";
  align: Array<"left" | "right" | "center" | null>;
  rows: MarkdownTableRow[];
};

export type MarkdownTableRow = { cells: MarkdownInline[][] };
export type MarkdownText = { type: "text"; value: string };
export type MarkdownEmphasis = { type: "emphasis"; children: MarkdownInline[] };
export type MarkdownStrong = { type: "strong"; children: MarkdownInline[] };
export type MarkdownDelete = { type: "delete"; children: MarkdownInline[] };
export type MarkdownInlineCode = { type: "inline-code"; value: string };

export type MarkdownLink = {
  type: "link";
  url: string;
  title: string | null;
  children: MarkdownInline[];
};

export type MarkdownImage = {
  type: "image";
  url: string;
  title: string | null;
  alt: string;
};

export type MarkdownBreak = { type: "break" };

export type MarkdownUnsupportedBlock = {
  type: "unsupported-block";
  sourceType: string;
};

export type MarkdownUnsupportedInline = {
  type: "unsupported-inline";
  sourceType: string;
};
