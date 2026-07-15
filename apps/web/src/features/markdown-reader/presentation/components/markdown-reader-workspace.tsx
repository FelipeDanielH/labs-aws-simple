"use client";

import { AlertCircle, LoaderCircle } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { MarkdownDocumentView } from "./markdown-document-view";
import { MarkdownFileSelector } from "./markdown-file-selector";
import { createMarkdownLoader, MarkdownLoaderError } from "../../index";
import type { MarkdownDocument } from "../../domain/entities/markdown-document";
import { messages } from "@/shared/config/translations";
import { usePreferencesStore } from "@/shared/store/preferences-store";

type ReaderState =
  | { status: "idle" }
  | { status: "loading"; fileName: string }
  | { status: "ready"; document: MarkdownDocument }
  | { status: "error"; message: string };

export function MarkdownReaderWorkspace() {
  const locale = usePreferencesStore((state) => state.locale);
  const copy = messages[locale].markdownReader;
  const loader = useMemo(() => createMarkdownLoader(), []);
  const requestId = useRef(0);
  const [state, setState] = useState<ReaderState>({ status: "idle" });

  const handleFileSelected = async (file: File) => {
    const currentRequest = ++requestId.current;
    setState({ status: "loading", fileName: file.name });

    try {
      const document = await loader.execute(file);
      if (currentRequest === requestId.current) {
        setState({ status: "ready", document });
      }
    } catch (error) {
      if (currentRequest === requestId.current) {
        setState({ status: "error", message: getErrorMessage(error, copy) });
      }
    }
  };

  return (
    <section className="space-y-5" aria-labelledby="markdown-reader-title">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2
            id="markdown-reader-title"
            className="text-2xl font-semibold tracking-tight"
          >
            {copy.title}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {copy.description}
          </p>
        </div>
        {state.status === "ready" ? (
          <MarkdownFileSelector
            inputId="markdown-file-replacement"
            selectFileLabel={copy.replaceFile}
            dropHint={copy.dropHint}
            acceptedFilesLabel={copy.acceptedFiles}
            compact
            onFileSelected={handleFileSelected}
          />
        ) : null}
      </div>

      {state.status === "idle" ? (
        <div className="space-y-4">
          <MarkdownFileSelector
            inputId="markdown-file"
            selectFileLabel={copy.selectFile}
            dropHint={copy.dropHint}
            acceptedFilesLabel={copy.acceptedFiles}
            onFileSelected={handleFileSelected}
          />
          <div className="text-center">
            <p className="font-medium">{copy.emptyTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {copy.emptyDescription}
            </p>
          </div>
        </div>
      ) : null}

      {state.status === "loading" ? (
        <div className="flex min-h-48 items-center justify-center gap-3 rounded-2xl border bg-card">
          <LoaderCircle
            aria-hidden="true"
            className="size-5 animate-spin text-primary"
          />
          <span>{copy.loading}</span>
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="space-y-4">
          <div
            role="alert"
            className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive"
          >
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0"
            />
            <p>{state.message}</p>
          </div>
          <MarkdownFileSelector
            inputId="markdown-file-retry"
            selectFileLabel={copy.selectFile}
            dropHint={copy.dropHint}
            acceptedFilesLabel={copy.acceptedFiles}
            onFileSelected={handleFileSelected}
          />
        </div>
      ) : null}

      {state.status === "ready" ? (
        <MarkdownDocumentView document={state.document} />
      ) : null}
    </section>
  );
}

function getErrorMessage(
  error: unknown,
  copy: (typeof messages)["es"]["markdownReader"],
): string {
  if (!(error instanceof MarkdownLoaderError)) return copy.parseFailed;

  const messagesByCode = {
    INVALID_FILE_EXTENSION: copy.invalidExtension,
    FILE_TOO_LARGE: copy.fileTooLarge,
    FILE_READ_FAILED: copy.readFailed,
    MARKDOWN_PARSE_FAILED: copy.parseFailed,
  } as const;

  return messagesByCode[error.code];
}
