import { FileText } from "lucide-react";

import { MarkdownRenderer } from "../rendering/markdown-renderer";
import type { MarkdownDocument } from "../../domain/entities/markdown-document";
import type { AppLocale } from "@/shared/config/preferences";

type MarkdownDocumentViewProps = {
  document: MarkdownDocument;
  locale: AppLocale;
};

export function MarkdownDocumentView({
  document,
  locale,
}: MarkdownDocumentViewProps) {
  return (
    <article className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
      <header className="flex items-center gap-3 border-b bg-muted/30 px-5 py-4">
        <FileText aria-hidden="true" className="size-5 text-primary" />
        <div className="min-w-0">
          <h3 className="truncate font-medium">{document.name}</h3>
          <p className="text-xs text-muted-foreground">
            {formatBytes(document.size)}
          </p>
        </div>
      </header>
      <div className="px-6 py-8 sm:px-10 sm:py-10">
        <MarkdownRenderer source={document.source} locale={locale} />
      </div>
    </article>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KiB`;
}
