export type BlobAuthOptions = {
  token?: string;
};

export function blobAuthOptions(): BlobAuthOptions {
  const token = blobReadWriteToken();
  return token ? { token } : {};
}

export function blobReadWriteToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim() || undefined;
}
