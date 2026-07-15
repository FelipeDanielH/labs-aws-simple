const ROOT = "aws-labs/v1";

export const contentPaths = {
  root: ROOT,
  documents: `${ROOT}/documents/`,
  taxonomy: `${ROOT}/system/taxonomy.json`,
  catalog: `${ROOT}/system/public-catalog.json`,
  documentFolder(slug: string, id: string) {
    return `${ROOT}/documents/${slug}-${id}`;
  },
  manifest(folder: string) {
    return `${folder}/manifest.json`;
  },
  markdown(folder: string, generationId: string) {
    return `${folder}/document-${generationId}.md`;
  },
  image(folder: string, name: string) {
    return `${folder}/images/${name}`;
  },
};

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
