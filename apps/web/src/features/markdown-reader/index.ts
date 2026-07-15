import {
  LoadMarkdownDocument,
  type MarkdownLoaderPolicy,
} from "./application/use-cases/load-markdown-document";
import { RemarkMarkdownParser } from "./infrastructure/parsers/remark-markdown-parser";

export type { MarkdownFile } from "./application/ports/markdown-file";
export type { MarkdownParser } from "./application/ports/markdown-parser";
export {
  defaultMarkdownLoaderPolicy,
  LoadMarkdownDocument,
  type MarkdownLoaderPolicy,
} from "./application/use-cases/load-markdown-document";
export type {
  MarkdownBlock,
  MarkdownDocument,
  MarkdownInline,
} from "./domain/entities/markdown-document";
export {
  MarkdownLoaderError,
  type MarkdownLoaderErrorCode,
} from "./domain/errors/markdown-loader-error";

export function createMarkdownLoader(
  policy?: MarkdownLoaderPolicy,
): LoadMarkdownDocument {
  return new LoadMarkdownDocument(new RemarkMarkdownParser(), policy);
}
