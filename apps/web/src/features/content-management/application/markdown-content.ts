import { normalizeReference } from "./html-content";

export function assertSafeMarkdownUrls(source: string): void {
  for (const match of source.matchAll(
    /!?\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g,
  )) {
    const value = match[1] ?? "";
    if (value && normalizeReference(value).kind === "blocked") {
      throw new Error(`Markdown contiene una URL no permitida: ${value}`);
    }
  }
}

export function markdownLocalAssetReferences(source: string): string[] {
  const references = new Set<string>();
  for (const match of source.matchAll(
    /!\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g,
  )) {
    const normalized = normalizeReference(match[1] ?? "");
    if (normalized.kind !== "local") continue;
    references.add(normalized.value.split(/[?#]/u)[0].replace(/^assets\//, ""));
  }
  return [...references];
}
