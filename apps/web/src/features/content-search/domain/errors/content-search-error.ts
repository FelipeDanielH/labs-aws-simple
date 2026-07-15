export type ContentSearchErrorCode =
  "INVALID_DOCUMENT" | "DUPLICATE_DOCUMENT_ID" | "INVALID_QUERY";

export class ContentSearchError extends Error {
  constructor(
    public readonly code: ContentSearchErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ContentSearchError";
  }
}
