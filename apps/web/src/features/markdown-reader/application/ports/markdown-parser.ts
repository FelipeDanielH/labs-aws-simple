import type { MarkdownBlock } from "../../domain/entities/markdown-document";

export interface MarkdownParser {
  parse(source: string): MarkdownBlock[];
}
