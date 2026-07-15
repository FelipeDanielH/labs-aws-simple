import type {
  BlockContent,
  ListItem,
  PhrasingContent,
  RootContent,
  Table,
  TableCell,
  TableRow,
} from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import type { MarkdownParser } from "../../application/ports/markdown-parser";
import type {
  MarkdownBlock,
  MarkdownInline,
  MarkdownListItem,
  MarkdownTableRow,
} from "../../domain/entities/markdown-document";

export class RemarkMarkdownParser implements MarkdownParser {
  private readonly processor = unified().use(remarkParse).use(remarkGfm);

  parse(source: string): MarkdownBlock[] {
    return this.processor
      .parse(source)
      .children.map(mapBlock)
      .filter((block): block is MarkdownBlock => block !== null);
  }
}

function mapBlock(node: RootContent | BlockContent): MarkdownBlock | null {
  switch (node.type) {
    case "heading":
      return {
        type: "heading",
        depth: node.depth,
        children: node.children.map(mapInline),
      };
    case "paragraph":
      return {
        type: "paragraph",
        children: node.children.map(mapInline),
      };
    case "blockquote":
      return {
        type: "blockquote",
        children: node.children
          .map(mapBlock)
          .filter((child): child is MarkdownBlock => child !== null),
      };
    case "list":
      return {
        type: "list",
        ordered: node.ordered ?? false,
        start: node.start ?? null,
        items: node.children.map(mapListItem),
      };
    case "code":
      return {
        type: "code",
        language: node.lang ?? null,
        meta: node.meta ?? null,
        value: node.value,
      };
    case "thematicBreak":
      return { type: "thematic-break" };
    case "table":
      return mapTable(node);
    case "definition":
    case "footnoteDefinition":
      return null;
    default:
      return { type: "unsupported-block", sourceType: node.type };
  }
}

function mapListItem(node: ListItem): MarkdownListItem {
  return {
    type: "list-item",
    checked: node.checked ?? null,
    children: node.children
      .map(mapBlock)
      .filter((child): child is MarkdownBlock => child !== null),
  };
}

function mapTable(node: Table): MarkdownBlock {
  return {
    type: "table",
    align: node.align ?? [],
    rows: node.children.map(mapTableRow),
  };
}

function mapTableRow(node: TableRow): MarkdownTableRow {
  return { cells: node.children.map(mapTableCell) };
}

function mapTableCell(node: TableCell): MarkdownInline[] {
  return node.children.map(mapInline);
}

function mapInline(node: PhrasingContent): MarkdownInline {
  switch (node.type) {
    case "text":
      return { type: "text", value: node.value };
    case "emphasis":
      return { type: "emphasis", children: node.children.map(mapInline) };
    case "strong":
      return { type: "strong", children: node.children.map(mapInline) };
    case "delete":
      return { type: "delete", children: node.children.map(mapInline) };
    case "inlineCode":
      return { type: "inline-code", value: node.value };
    case "link":
      return {
        type: "link",
        url: node.url,
        title: node.title ?? null,
        children: node.children.map(mapInline),
      };
    case "image":
      return {
        type: "image",
        url: node.url,
        title: node.title ?? null,
        alt: node.alt ?? "",
      };
    case "break":
      return { type: "break" };
    default:
      return { type: "unsupported-inline", sourceType: node.type };
  }
}
