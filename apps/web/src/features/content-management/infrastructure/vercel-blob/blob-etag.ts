export function normalizeBlobEtag(etag: string): string {
  const trimmed = etag.trim().replace(/^W\//i, "");
  return trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1)
    : trimmed;
}
