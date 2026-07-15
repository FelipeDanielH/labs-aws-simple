import Markdown, { defaultUrlTransform, type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import { markdownComponents } from "./markdown-components";
import { markdownSanitizeSchema } from "./markdown-sanitize-schema";
import { rehypeNeutralizeActiveHtml } from "./rehype-neutralize-active-html";

export type MarkdownRendererProps = {
  source: string;
  components?: Components;
};

export function MarkdownRenderer({
  source,
  components,
}: MarkdownRendererProps) {
  return (
    <div className="markdown-document overflow-hidden">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeRaw,
          rehypeNeutralizeActiveHtml,
          [rehypeSanitize, markdownSanitizeSchema],
        ]}
        components={{ ...markdownComponents, ...components }}
        urlTransform={defaultUrlTransform}
      >
        {source}
      </Markdown>
    </div>
  );
}
