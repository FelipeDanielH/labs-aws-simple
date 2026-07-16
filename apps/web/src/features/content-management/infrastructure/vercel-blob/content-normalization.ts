import type {
  CatalogEntry,
  DocumentAsset,
  DocumentContent,
  DocumentManifest,
  PublicCatalog,
} from "../../domain/models";

type JsonObject = Record<string, unknown>;

export function normalizeDocumentManifest(value: unknown): DocumentManifest {
  const raw = object(value, "manifiesto");
  const folder = string(raw.folder, "folder");
  const content = raw.content
    ? normalizeContent(raw.content)
    : legacyMarkdownContent(raw);

  return {
    ...(raw as Omit<DocumentManifest, "schemaVersion" | "content" | "assets">),
    schemaVersion: 2,
    content,
    assets: array(raw.assets).map((asset) => normalizeAsset(asset, folder)),
  };
}

export function normalizePublicCatalog(value: unknown): PublicCatalog {
  const raw = object(value, "catálogo público");
  return {
    schemaVersion: 2,
    generatedAt: string(raw.generatedAt, "generatedAt"),
    documents: array(raw.documents).map((entry) =>
      normalizeCatalogEntry(entry),
    ),
  };
}

function normalizeCatalogEntry(value: unknown): CatalogEntry {
  const raw = object(value, "entrada de catálogo");
  const folder = string(raw.folder, "folder");
  const content = raw.content
    ? normalizeContent(raw.content)
    : legacyMarkdownContent(raw);
  return {
    ...(raw as Omit<CatalogEntry, "content">),
    folder,
    content,
  };
}

function normalizeContent(value: unknown): DocumentContent {
  const raw = object(value, "contenido");
  const kind = raw.kind;
  if (kind !== "markdown" && kind !== "html") {
    throw new TypeError("El tipo de contenido almacenado no es válido.");
  }
  return {
    kind,
    pathname: string(raw.pathname, "content.pathname"),
    url: string(raw.url, "content.url"),
    assetBaseUrl:
      raw.assetBaseUrl === null || raw.assetBaseUrl === undefined
        ? null
        : string(raw.assetBaseUrl, "content.assetBaseUrl"),
  };
}

function legacyMarkdownContent(raw: JsonObject): DocumentContent {
  const url = string(raw.markdownUrl, "markdownUrl");
  return {
    kind: "markdown",
    pathname:
      typeof raw.markdownPathname === "string"
        ? raw.markdownPathname
        : pathnameFromUrl(url),
    url,
    assetBaseUrl: null,
  };
}

function normalizeAsset(value: unknown, folder: string): DocumentAsset {
  const raw = object(value, "recurso");
  const pathname = string(raw.pathname, "asset.pathname");
  return {
    ...(raw as Omit<DocumentAsset, "relativePath">),
    pathname,
    relativePath:
      typeof raw.relativePath === "string"
        ? raw.relativePath
        : pathname.startsWith(`${folder}/`)
          ? pathname.slice(folder.length + 1)
          : (pathname.split("/").pop() ?? pathname),
  };
}

function pathnameFromUrl(value: string): string {
  try {
    return decodeURIComponent(new URL(value).pathname.replace(/^\/+/, ""));
  } catch {
    throw new TypeError("La URL de contenido almacenada no es válida.");
  }
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`El ${label} almacenado no es válido.`);
  }
  return value as JsonObject;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) {
    throw new TypeError(`El campo ${label} almacenado no es válido.`);
  }
  return value;
}
