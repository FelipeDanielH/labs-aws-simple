import type { Components } from "react-markdown";

import { ImageLightbox } from "@workspace/ui/components/image-lightbox";

export const markdownComponents: Components = {
  h1: ({ node: _node, ...props }) => (
    <h1
      className="mt-10 scroll-m-20 text-4xl font-bold tracking-tight first:mt-0"
      {...props}
    />
  ),
  h2: ({ node: _node, ...props }) => (
    <h2
      className="mt-9 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight"
      {...props}
    />
  ),
  h3: ({ node: _node, ...props }) => (
    <h3
      className="mt-8 scroll-m-20 text-2xl font-semibold tracking-tight"
      {...props}
    />
  ),
  h4: ({ node: _node, ...props }) => (
    <h4
      className="mt-7 scroll-m-20 text-xl font-semibold tracking-tight"
      {...props}
    />
  ),
  h5: ({ node: _node, ...props }) => (
    <h5
      className="mt-6 scroll-m-20 text-lg font-semibold tracking-tight"
      {...props}
    />
  ),
  h6: ({ node: _node, ...props }) => (
    <h6
      className="mt-6 scroll-m-20 text-base font-semibold tracking-tight"
      {...props}
    />
  ),
  p: ({ node: _node, ...props }) => (
    <p className="my-4 leading-7 text-foreground/90" {...props} />
  ),
  a: ({ node: _node, ...props }) => (
    <a
      className="font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
      {...props}
      rel="noreferrer noopener"
    />
  ),
  blockquote: ({ node: _node, ...props }) => (
    <blockquote
      className="my-6 border-l-4 border-primary/50 bg-muted/50 py-1 pr-4 pl-5 text-muted-foreground italic"
      {...props}
    />
  ),
  ul: ({ node: _node, ...props }) => (
    <ul className="my-5 list-disc space-y-2 pl-7" {...props} />
  ),
  ol: ({ node: _node, ...props }) => (
    <ol className="my-5 list-decimal space-y-2 pl-7" {...props} />
  ),
  li: ({ node: _node, ...props }) => (
    <li className="pl-1 leading-7" {...props} />
  ),
  code: ({ node: _node, className, ...props }) => (
    <code
      className={
        className
          ? `${className} font-mono`
          : "rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em] text-foreground"
      }
      {...props}
    />
  ),
  pre: ({ node, children, ...props }) => {
    const blockedTag = node?.properties.dataBlockedHtml;
    return (
      <pre
        className={
          blockedTag
            ? "my-5 overflow-x-auto rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
            : "my-6 overflow-x-auto rounded-xl border bg-zinc-950 p-4 text-sm leading-6 text-zinc-50"
        }
        data-blocked-html={
          typeof blockedTag === "string" ? blockedTag : undefined
        }
        {...props}
      >
        {children}
      </pre>
    );
  },
  hr: ({ node: _node, ...props }) => <hr className="my-8" {...props} />,
  table: ({ node: _node, ...props }) => (
    <div className="my-6 overflow-x-auto rounded-xl border">
      <table
        className="w-full min-w-[40rem] border-collapse text-sm"
        {...props}
      />
    </div>
  ),
  thead: ({ node: _node, ...props }) => (
    <thead className="bg-muted/70" {...props} />
  ),
  tr: ({ node: _node, ...props }) => (
    <tr className="border-b last:border-0" {...props} />
  ),
  th: ({ node: _node, ...props }) => (
    <th
      className="border-r border-b px-4 py-3 text-left font-semibold last:border-r-0"
      {...props}
    />
  ),
  td: ({ node: _node, ...props }) => (
    <td className="border-r px-4 py-3 align-top last:border-r-0" {...props} />
  ),
  img: ({ node: _node, alt = "", ...props }) => (
    <ImageLightbox alt={alt} loading="lazy" {...props} />
  ),
  details: ({ node: _node, ...props }) => (
    <details className="my-5 rounded-xl border bg-muted/20 p-4" {...props} />
  ),
  summary: ({ node: _node, ...props }) => (
    <summary className="cursor-pointer font-semibold" {...props} />
  ),
  iframe: ({ node: _node, src, title, ...props }) => (
    <iframe
      {...props}
      src={src}
      title={title ?? "Embedded content"}
      sandbox=""
      referrerPolicy="no-referrer"
      loading="lazy"
      className="my-5 min-h-80 w-full rounded-xl border bg-background"
    />
  ),
  form: ({ node: _node, children }) => (
    <div
      className="my-5 space-y-3 rounded-xl border bg-muted/20 p-4"
      role="group"
    >
      {children}
    </div>
  ),
  input: ({ node: _node, type, ...props }) => (
    <input
      {...props}
      type={type}
      disabled
      readOnly
      className="rounded border bg-muted px-2 py-1 accent-primary disabled:opacity-80"
    />
  ),
  button: ({ node: _node, children }) => (
    <button
      type="button"
      disabled
      className="rounded-lg border bg-muted px-3 py-2 text-sm opacity-80"
    >
      {children}
    </button>
  ),
  select: ({ node: _node, children, ...props }) => (
    <select
      {...props}
      disabled
      className="rounded-lg border bg-muted px-3 py-2"
    >
      {children}
    </select>
  ),
  textarea: ({ node: _node, ...props }) => (
    <textarea
      {...props}
      readOnly
      className="min-h-24 w-full rounded-lg border bg-muted p-3"
    />
  ),
};
