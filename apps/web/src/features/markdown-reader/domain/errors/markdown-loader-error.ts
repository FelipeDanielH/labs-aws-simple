export type MarkdownLoaderErrorCode =
  | "INVALID_FILE_EXTENSION"
  | "FILE_TOO_LARGE"
  | "FILE_READ_FAILED"
  | "MARKDOWN_PARSE_FAILED";

export class MarkdownLoaderError extends Error {
  constructor(
    public readonly code: MarkdownLoaderErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MarkdownLoaderError";
  }
}
