import type { Heading, Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import type { Plugin } from "unified";
import { unified } from "unified";

const HEADING_MARKER_PROPERTY = "dataTocId";

type TraversableNode = {
  type: string;
  value?: string;
  alt?: string;
  children?: TraversableNode[];
};

export type MarkdownTableOfContentsItem = {
  id: string;
  title: string;
  level: 1 | 2 | 3 | 4;
};

export const remarkMarkdownHeadingIndex: Plugin<[], Root> = () => (tree) => {
  annotateMarkdownHeadings(tree);
};

export const rehypeRestoreMarkdownHeadingIds: Plugin = () => (tree) => {
  walkTree(tree as TraversableNode, (node) => {
    if (!isHtmlHeading(node)) return;

    const element = node as TraversableNode & {
      properties?: Record<string, unknown>;
    };
    const properties = element.properties;
    if (!properties) return;

    const marker = properties[HEADING_MARKER_PROPERTY];
    if (typeof marker !== "string") return;

    delete properties[HEADING_MARKER_PROPERTY];
    if (!isSafeHeadingId(marker)) return;

    element.properties = { ...element.properties, id: marker };
  });
};

export function extractMarkdownTableOfContents(
  source: string,
): MarkdownTableOfContentsItem[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(source) as Root;
  annotateMarkdownHeadings(tree);

  const items: MarkdownTableOfContentsItem[] = [];
  walkTree(tree as TraversableNode, (node) => {
    if (node.type !== "heading") return;

    const heading = node as Heading;
    if (!isTableOfContentsHeadingDepth(heading.depth)) return;

    const id = getHeadingMarker(heading);
    if (!id) return;

    items.push({
      id,
      title: getNodeText(heading as TraversableNode).trim(),
      level: heading.depth,
    });
  });

  return items;
}

function isTableOfContentsHeadingDepth(
  depth: Heading["depth"],
): depth is MarkdownTableOfContentsItem["level"] {
  return depth >= 1 && depth <= 4;
}

function annotateMarkdownHeadings(tree: Root) {
  const slugger = createHeadingSlugger();

  walkTree(tree as TraversableNode, (node) => {
    if (node.type !== "heading") return;

    const heading = node as Heading;
    const id = slugger(getNodeText(heading as TraversableNode));
    const data = (heading.data ?? {}) as NonNullable<Heading["data"]> & {
      hProperties?: Record<string, unknown>;
    };

    heading.data = {
      ...data,
      hProperties: {
        ...data.hProperties,
        [HEADING_MARKER_PROPERTY]: id,
      },
    };
  });
}

function createHeadingSlugger() {
  const occurrences = new Map<string, number>();

  return (title: string) => {
    const normalized = title
      .normalize("NFKD")
      .replace(/\p{Mark}/gu, "")
      .toLocaleLowerCase("es")
      .replace(/[^\p{Letter}\p{Number}\s_-]/gu, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-");
    const base = `section-${normalized || "seccion"}`;
    const count = occurrences.get(base) ?? 0;
    occurrences.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  };
}

function getHeadingMarker(heading: Heading): string | null {
  const data = heading.data as
    | (NonNullable<Heading["data"]> & {
        hProperties?: Record<string, unknown>;
      })
    | undefined;
  const marker = data?.hProperties?.[HEADING_MARKER_PROPERTY];
  return typeof marker === "string" ? marker : null;
}

function getNodeText(node: TraversableNode): string {
  if (typeof node.value === "string") return node.value;
  if (node.type === "image" && typeof node.alt === "string") return node.alt;
  if (!node.children?.length) return node.type === "break" ? " " : "";
  return node.children.map(getNodeText).join("");
}

function walkTree(
  node: TraversableNode,
  visitor: (node: TraversableNode) => void,
) {
  visitor(node);
  node.children?.forEach((child) => walkTree(child, visitor));
}

function isHtmlHeading(node: TraversableNode) {
  return /^h[1-6]$/.test(
    (node as TraversableNode & { tagName?: string }).tagName ?? "",
  );
}

function isSafeHeadingId(value: string) {
  return /^section-[\p{Letter}\p{Number}-]+$/u.test(value);
}
