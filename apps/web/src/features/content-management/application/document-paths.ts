const ROOT = "aws-labs/v1";

export const contentPaths = {
  root: ROOT,
  documents: `${ROOT}/documents/`,
  taxonomy: `${ROOT}/system/taxonomy.json`,
  taxonomyV2: `${ROOT}/system/taxonomy/manifest.json`,
  taxonomyLocaleVersion(locale: "es" | "en", generationId: string) {
    return `${ROOT}/system/taxonomy/${locale}/taxonomy-${generationId}.json`;
  },
  catalogs(locale: "es" | "en") {
    return `${ROOT}/system/catalog/${locale}/public-catalog-`;
  },
  catalogVersion(locale: "es" | "en", generationId: string) {
    return `${ROOT}/system/catalog/${locale}/public-catalog-${generationId}.json`;
  },
  documentFolder(slug: string, id: string) {
    return `${ROOT}/documents/${slug}-${id}`;
  },
  manifest(folder: string) {
    return `${folder}/manifest.json`;
  },
  markdown(folder: string, generationId: string) {
    return `${folder}/document-${generationId}.md`;
  },
  html(folder: string, generationId: string) {
    return `${folder}/document-${generationId}.html`;
  },
  content(
    folder: string,
    locale: "es" | "en",
    generationId: string,
    kind: "markdown" | "html",
  ) {
    return kind === "html"
      ? `${folder}/${locale}/document-${generationId}.html`
      : `${folder}/${locale}/document-${generationId}.md`;
  },
  asset(folder: string, relativePath: string) {
    return `${folder}/assets/${relativePath}`;
  },
  image(folder: string, name: string) {
    return `${folder}/images/${name}`;
  },
  duplicateKey(canonicalKey: string) {
    return `${ROOT}/system/document-keys/${slugify(canonicalKey)}.json`;
  },
  documentId(id: string) {
    return `${ROOT}/system/document-ids/${id}.json`;
  },
};

export function canonicalDocumentKey(fileName: string): string {
  return slugify(fileName);
}

export function slugify(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "documento";
}

export function createShortId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 12);
}

export function assertSafeBlobPath(pathname: string): void {
  if (
    !pathname.startsWith(`${ROOT}/`) ||
    pathname.includes("..") ||
    pathname.includes("\\")
  ) {
    throw new Error("Ruta Blob no permitida.");
  }
}

export function normalizeRelativeAssetPath(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  const segments = normalized.split("/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Ruta de recurso no permitida.");
  }
  return segments.map((segment) => encodePathSegment(segment)).join("/");
}

export function resolveRelativeAssetPath(
  baseFilePath: string,
  reference: string,
): string {
  const stack = baseFilePath.split("/").slice(0, -1);
  for (const part of reference.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!stack.length)
        throw new Error("Un recurso intenta salir de assets/.");
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return normalizeRelativeAssetPath(stack.join("/"));
}

function encodePathSegment(value: string): string {
  const normalized = value.normalize("NFC").trim();
  if (!normalized || /[\u0000-\u001f\u007f?#%:]/u.test(normalized)) {
    throw new Error("Ruta de recurso no permitida.");
  }
  return normalized;
}
