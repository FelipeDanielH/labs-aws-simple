import { FileUp } from "lucide-react";
import type { ChangeEvent, DragEvent } from "react";

type MarkdownFileSelectorProps = {
  inputId: string;
  selectFileLabel: string;
  dropHint: string;
  acceptedFilesLabel: string;
  disabled?: boolean;
  compact?: boolean;
  onFileSelected: (file: File) => void;
};

export function MarkdownFileSelector({
  inputId,
  selectFileLabel,
  dropHint,
  acceptedFilesLabel,
  disabled = false,
  compact = false,
  onFileSelected,
}: MarkdownFileSelectorProps) {
  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (file) onFileSelected(file);
    event.currentTarget.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (disabled) return;
    const file = event.dataTransfer.files[0];
    if (file) onFileSelected(file);
  };

  return (
    <label
      htmlFor={inputId}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      className={
        compact
          ? "inline-flex cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium transition hover:bg-muted"
          : "flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 px-6 py-10 text-center transition hover:border-primary/60 hover:bg-primary/10"
      }
      aria-disabled={disabled}
    >
      <input
        id={inputId}
        type="file"
        accept=".md,.markdown,text/markdown"
        className="sr-only"
        disabled={disabled}
        onChange={handleInputChange}
      />
      <FileUp
        aria-hidden="true"
        className={compact ? "size-4" : "mb-4 size-9 text-primary"}
      />
      <span className="font-semibold">{selectFileLabel}</span>
      {!compact ? (
        <>
          <span className="mt-1 text-sm text-muted-foreground">{dropHint}</span>
          <span className="mt-4 text-xs text-muted-foreground">
            {acceptedFilesLabel}
          </span>
        </>
      ) : null}
    </label>
  );
}
