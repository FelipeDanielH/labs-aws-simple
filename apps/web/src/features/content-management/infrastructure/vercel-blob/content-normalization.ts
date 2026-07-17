import { canonicalDocumentKey } from "../../application/document-paths";
import { withManifestProjection } from "../../domain/models";
import type {
  CatalogEntry,
  ContentLocale,
  DocumentAsset,
  DocumentContent,
  DocumentLocalization,
  DocumentManifest,
  DocumentMetadata,
  LocalizedDocumentMetadata,
  PublicCatalog,
  Taxonomy,
} from "../../domain/models";

type JsonObject = Record<string, unknown>;

export function normalizeDocumentManifest(value: unknown): DocumentManifest {
  const raw = object(value, "manifiesto");
  if (raw.schemaVersion === 3 && raw.localizations) {
    const folder = string(raw.folder, "folder");
    const localizationsRaw = object(raw.localizations, "localizations");
    const localizations: DocumentManifest["localizations"] = {};
    for (const locale of ["es", "en"] as const) {
      if (localizationsRaw[locale]) {
        localizations[locale] = normalizeLocalization(
          localizationsRaw[locale],
          locale,
        );
      }
    }
    return withManifestProjection({
      schemaVersion: 3,
      id: string(raw.id, "id"),
      folder,
      canonicalKey: string(raw.canonicalKey, "canonicalKey"),
      order: nullableNumber(raw.order),
      categoryId: nullableString(raw.categoryId),
      subcategoryId: nullableString(raw.subcategoryId),
      assets: array(raw.assets).map((asset) => normalizeAsset(asset, folder)),
      localizations,
      createdAt: string(raw.createdAt, "createdAt"),
      updatedAt: string(raw.updatedAt, "updatedAt"),
      deletedAt: nullableString(raw.deletedAt),
    });
  }
  return migrateV2Manifest(raw);
}

export function normalizePublicCatalog(
  value: unknown,
  locale: ContentLocale = "es",
): PublicCatalog {
  const raw = object(value, "catálogo público");
  if (raw.schemaVersion === 3) {
    return {
      schemaVersion: 3,
      locale: raw.locale === "en" ? "en" : locale,
      generatedAt: string(raw.generatedAt, "generatedAt"),
      documents: array(raw.documents).map(normalizeCatalogEntry),
    };
  }
  return {
    schemaVersion: 3,
    locale: "es",
    generatedAt: string(raw.generatedAt, "generatedAt"),
    documents: array(raw.documents).map((entry) =>
      migrateV2CatalogEntry(entry),
    ),
  };
}

export function normalizeTaxonomy(value: unknown): Taxonomy {
  const raw = object(value, "taxonomía");
  if (raw.schemaVersion === 2) {
    const taxonomy = raw as Taxonomy;
    return {
      ...taxonomy,
      categories: taxonomy.categories.map((category) => ({
        ...category,
        name: category.name ?? category.localizations.es?.name ?? "",
        slug: category.slug ?? category.localizations.es?.slug ?? "",
        subcategories: category.subcategories.map((subcategory) => ({
          ...subcategory,
          name: subcategory.name ?? subcategory.localizations.es?.name ?? "",
          slug: subcategory.slug ?? subcategory.localizations.es?.slug ?? "",
        })),
      })),
    };
  }
  return {
    schemaVersion: 2,
    updatedAt:
      typeof raw.updatedAt === "string"
        ? raw.updatedAt
        : new Date(0).toISOString(),
    categories: array(raw.categories).map((categoryValue) => {
      const category = object(categoryValue, "categoría");
      return {
        id: string(category.id, "category.id"),
        localizations: {
          es: {
            name: string(category.name, "category.name"),
            slug: string(category.slug, "category.slug"),
          },
        },
        subcategories: array(category.subcategories).map((subcategoryValue) => {
          const subcategory = object(subcategoryValue, "subcategoría");
          return {
            id: string(subcategory.id, "subcategory.id"),
            localizations: {
              es: {
                name: string(subcategory.name, "subcategory.name"),
                slug: string(subcategory.slug, "subcategory.slug"),
              },
            },
            name: string(subcategory.name, "subcategory.name"),
            slug: string(subcategory.slug, "subcategory.slug"),
          };
        }),
        name: string(category.name, "category.name"),
        slug: string(category.slug, "category.slug"),
      };
    }),
  };
}

function migrateV2Manifest(raw: JsonObject): DocumentManifest {
  const folder = string(raw.folder, "folder");
  const metadata = normalizeMetadata(raw.metadata);
  const now = string(raw.createdAt, "createdAt");
  const localization: DocumentLocalization = {
    locale: "es",
    slug: string(raw.slug, "slug"),
    originalFileName: string(raw.originalFileName, "originalFileName"),
    status: normalizeStatus(raw.status),
    metadata: withoutOrder(metadata),
    content: raw.content
      ? normalizeContent(raw.content)
      : legacyMarkdownContent(raw),
    createdAt: now,
    updatedAt: string(raw.updatedAt, "updatedAt"),
    publishedAt: nullableString(raw.publishedAt),
    deletedAt: nullableString(raw.deletedAt),
  };
  return withManifestProjection({
    schemaVersion: 3,
    id: string(raw.id, "id"),
    folder,
    canonicalKey: canonicalDocumentKey(localization.originalFileName),
    order: metadata.order,
    categoryId: nullableString(raw.categoryId),
    subcategoryId: nullableString(raw.subcategoryId),
    assets: array(raw.assets).map((asset) => normalizeAsset(asset, folder)),
    localizations: { es: localization },
    createdAt: now,
    updatedAt: localization.updatedAt,
    deletedAt: localization.deletedAt,
  });
}

function normalizeLocalization(
  value: unknown,
  locale: ContentLocale,
): DocumentLocalization {
  const raw = object(value, `localización ${locale}`);
  return {
    locale,
    slug: string(raw.slug, "slug"),
    originalFileName: string(raw.originalFileName, "originalFileName"),
    status: normalizeStatus(raw.status),
    metadata: withoutOrder(normalizeMetadata(raw.metadata)),
    content: normalizeContent(raw.content),
    createdAt: string(raw.createdAt, "createdAt"),
    updatedAt: string(raw.updatedAt, "updatedAt"),
    publishedAt: nullableString(raw.publishedAt),
    deletedAt: nullableString(raw.deletedAt),
  };
}

function normalizeCatalogEntry(value: unknown): CatalogEntry {
  const raw = object(value, "entrada de catálogo");
  const locale: ContentLocale = raw.locale === "en" ? "en" : "es";
  const publishedAt = string(raw.publishedAt, "publishedAt");
  return {
    id: string(raw.id, "id"),
    locale,
    slug: string(raw.slug, "slug"),
    alternateSlugs:
      raw.alternateSlugs && typeof raw.alternateSlugs === "object"
        ? (raw.alternateSlugs as Partial<Record<ContentLocale, string>>)
        : { [locale]: string(raw.slug, "slug") },
    folder: string(raw.folder, "folder"),
    metadata: normalizeMetadata(raw.metadata),
    categoryId: nullableString(raw.categoryId),
    subcategoryId: nullableString(raw.subcategoryId),
    content: normalizeContent(raw.content),
    updatedAt: string(raw.updatedAt, "updatedAt"),
    publishedAt,
  };
}

function migrateV2CatalogEntry(value: unknown): CatalogEntry {
  const raw = object(value, "entrada de catálogo");
  const slug = string(raw.slug, "slug");
  return {
    id: string(raw.id, "id"),
    locale: "es",
    slug,
    alternateSlugs: { es: slug },
    folder: string(raw.folder, "folder"),
    metadata: normalizeMetadata(raw.metadata),
    categoryId: nullableString(raw.categoryId),
    subcategoryId: nullableString(raw.subcategoryId),
    content: raw.content
      ? normalizeContent(raw.content)
      : legacyMarkdownContent(raw),
    updatedAt: string(raw.updatedAt, "updatedAt"),
    publishedAt: string(raw.publishedAt, "publishedAt"),
  };
}

function normalizeMetadata(value: unknown): DocumentMetadata {
  const raw = object(value, "metadata");
  return {
    title: string(raw.title, "metadata.title"),
    summary: typeof raw.summary === "string" ? raw.summary : "",
    author: typeof raw.author === "string" ? raw.author : "",
    tags: array(raw.tags).filter(
      (tag): tag is string => typeof tag === "string",
    ),
    order: nullableNumber(raw.order),
    extra:
      raw.extra && typeof raw.extra === "object" && !Array.isArray(raw.extra)
        ? (raw.extra as DocumentMetadata["extra"])
        : {},
  };
}

function withoutOrder(metadata: DocumentMetadata): LocalizedDocumentMetadata {
  const { order: _order, ...localized } = metadata;
  return localized;
}

function normalizeContent(value: unknown): DocumentContent {
  const raw = object(value, "contenido");
  if (raw.kind !== "markdown" && raw.kind !== "html") {
    throw new TypeError("El tipo de contenido almacenado no es válido.");
  }
  return {
    kind: raw.kind,
    pathname: string(raw.pathname, "content.pathname"),
    url: string(raw.url, "content.url"),
    assetBaseUrl: nullableString(raw.assetBaseUrl),
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
    id:
      typeof raw.id === "string" && raw.id
        ? raw.id
        : (pathname.split("/").at(-1) ?? pathname),
    originalName: string(raw.originalName, "asset.originalName"),
    pathname,
    relativePath:
      typeof raw.relativePath === "string"
        ? raw.relativePath
        : pathname.startsWith(`${folder}/`)
          ? pathname.slice(folder.length + 1)
          : (pathname.split("/").at(-1) ?? pathname),
    url: string(raw.url, "asset.url"),
    contentType: string(raw.contentType, "asset.contentType"),
    size: typeof raw.size === "number" ? raw.size : 0,
    sha256: typeof raw.sha256 === "string" ? raw.sha256 : "",
  };
}

function pathnameFromUrl(value: string): string {
  return decodeURIComponent(new URL(value).pathname.replace(/^\/+/, ""));
}

function normalizeStatus(value: unknown) {
  if (value === "published" || value === "trashed") return value;
  return "draft";
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

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}
