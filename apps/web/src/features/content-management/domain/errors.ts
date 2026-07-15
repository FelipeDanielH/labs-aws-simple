export class ContentManagementError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "CONFLICT"
      | "INVALID_INPUT"
      | "NOT_CONFIGURED"
      | "UNAUTHORIZED"
      | "STORAGE_FAILURE",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ContentManagementError";
  }
}
