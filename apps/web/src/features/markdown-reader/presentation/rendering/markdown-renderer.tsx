import Markdown, { defaultUrlTransform, type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import {
  rehypeRestoreMarkdownHeadingIds,
  remarkMarkdownHeadingIndex,
} from "./markdown-heading-index";
import { createMarkdownComponents } from "./markdown-components";
import { markdownSanitizeSchema } from "./markdown-sanitize-schema";
import { rehypeNeutralizeActiveHtml } from "./rehype-neutralize-active-html";
import type { AppLocale } from "@/shared/config/preferences";
import { messages } from "@/shared/config/translations";

export type MarkdownRendererProps = {
  source: string;
  components?: Components;
  baseUrl?: string;
  locale?: AppLocale;
  urlTransform?: (url: string) => string;
};

export function MarkdownRenderer({
  source,
  components,
  baseUrl,
  locale = "es",
  urlTransform,
}: MarkdownRendererProps) {
  const localizedComponents = createMarkdownComponents(
    messages[locale].imageLightbox,
  );

  return (
    <div className="markdown-document overflow-hidden">
      <Markdown
        remarkPlugins={[remarkGfm, remarkMarkdownHeadingIndex]}
        rehypePlugins={[
          rehypeRaw,
          rehypeNeutralizeActiveHtml,
          [rehypeSanitize, markdownSanitizeSchema],
          rehypeRestoreMarkdownHeadingIds,
        ]}
        components={{ ...localizedComponents, ...components }}
        urlTransform={
          urlTransform ?? ((url) => transformMarkdownUrl(url, baseUrl))
        }
      >
        {source}
      </Markdown>
    </div>
  );
}

export function transformMarkdownUrl(url: string, baseUrl?: string): string {
  const safeUrl = defaultUrlTransform(url);
  if (!baseUrl || (!safeUrl.startsWith("./") && !safeUrl.startsWith("../"))) {
    return safeUrl;
  }
  try {
    return new URL(safeUrl, baseUrl).href;
  } catch {
    return "";
  }
}
