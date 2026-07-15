import type { SearchableContent } from "../../domain/entities/searchable-content";
import type {
  MarkdownDocument,
  MarkdownInline,
} from "@/features/markdown-reader/domain/entities/markdown-document";

export type MarkdownSearchMetadata = Partial<
  Pick<
    SearchableContent,
    | "kind"
    | "summary"
    | "tags"
    | "categoryIds"
    | "hierarchy"
    | "attributes"
    | "order"
  >
> & {
  id: string;
  title?: string;
};

export function mapMarkdownToSearchableContent(
  document: MarkdownDocument,
  metadata: MarkdownSearchMetadata,
): SearchableContent {
  return {
    id: metadata.id,
    kind: metadata.kind ?? "document",
    title:
      metadata.title ?? findTitle(document) ?? removeExtension(document.name),
    summary: metadata.summary ?? findSummary(document) ?? "",
    content: document.source,
    tags: metadata.tags ?? [],
    categoryIds: metadata.categoryIds ?? [],
    hierarchy: metadata.hierarchy ?? {
      parentId: null,
      ancestorIds: [],
      path: [],
    },
    attributes: metadata.attributes ?? {},
    order: metadata.order ?? null,
  };
}

function findTitle(document: MarkdownDocument): string | null {
  const heading = document.blocks.find((block) => block.type === "heading");
  return heading?.type === "heading"
    ? inlineText(heading.children).trim() || null
    : null;
}

function findSummary(document: MarkdownDocument): string | null {
  const paragraph = document.blocks.find((block) => block.type === "paragraph");
  return paragraph?.type === "paragraph"
    ? inlineText(paragraph.children).trim() || null
    : null;
}

function inlineText(nodes: readonly MarkdownInline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
        case "inline-code":
          return node.value;
        case "image":
          return node.alt;
        case "break":
          return " ";
        case "emphasis":
        case "strong":
        case "delete":
        case "link":
          return inlineText(node.children);
        case "unsupported-inline":
          return "";
      }
    })
    .join("");
}

function removeExtension(fileName: string): string {
  return fileName.replace(/\.(?:md|markdown)$/i, "");
}
