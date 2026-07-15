export function normalizeBlobEtag(etag: string): string {
  const trimmed = etag.trim().replace(/^W\//i, "");
  return trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1)
    : trimmed;
}

export function versionedBlobUrl(url: string, etag: string): string {
  const versionedUrl = new URL(url);
  versionedUrl.searchParams.set("v", normalizeBlobEtag(etag));
  return versionedUrl.toString();
}
