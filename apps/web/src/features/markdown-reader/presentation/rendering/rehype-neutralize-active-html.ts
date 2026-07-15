import type { Element, Parents, Root, RootContent, Text } from "hast";

import { allowedMarkdownHtmlTags } from "./markdown-sanitize-schema";

export function rehypeNeutralizeActiveHtml() {
  return (tree: Root) => {
    neutralizeChildren(tree);
  };
}

function neutralizeChildren(parent: Parents): void {
  parent.children = parent.children.map((child) => {
    if (child.type !== "element") return child;

    if (!allowedMarkdownHtmlTags.has(child.tagName)) {
      return createBlockedElement(child);
    }

    neutralizeChildren(child);
    return child;
  });
}

function createBlockedElement(element: Element): RootContent {
  const content = getTextContent(element).trim();
  const description = content
    ? `<${element.tagName}>${content}</${element.tagName}>`
    : `<${element.tagName}>`;

  const text: Text = { type: "text", value: description };

  return {
    type: "element",
    tagName: "pre",
    properties: {
      className: ["blocked-html"],
      dataBlockedHtml: element.tagName,
    },
    children: [text],
  };
}

function getTextContent(element: Element): string {
  return element.children
    .map((child) => {
      if (child.type === "text") return child.value;
      if (child.type === "element") return getTextContent(child);
      return "";
    })
    .join("");
}
