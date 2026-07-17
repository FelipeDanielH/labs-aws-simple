export const contentLocales = ["es", "en"] as const;
export type ContentLocale = (typeof contentLocales)[number];

export type DocumentStatus = "draft" | "published" | "trashed";
export type DocumentContentKind = "markdown" | "html";

export type MetadataScalar = string | number | boolean;
export type MetadataValue = MetadataScalar | MetadataScalar[];

export type DocumentMetadata = {
  title: string;
  summary: string;
  author: string;
  tags: string[];
  order: number | null;
  extra: Record<string, MetadataValue>;
};

export type LocalizedDocumentMetadata = Omit<DocumentMetadata, "order">;

export type DocumentAsset = {
  id: string;
  originalName: string;
  relativePath: string;
  pathname: string;
  url: string;
  contentType: string;
  size: number;
  sha256: string;
};

export type DocumentContent = {
  kind: DocumentContentKind;
  pathname: string;
  url: string;
  assetBaseUrl: string | null;
};

export type DocumentLocalization = {
  locale: ContentLocale;
  slug: string;
  originalFileName: string;
  status: DocumentStatus;
  metadata: LocalizedDocumentMetadata;
  content: DocumentContent;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  deletedAt: string | null;
};

export type DocumentManifest = {
  schemaVersion: 3;
  id: string;
  folder: string;
  canonicalKey: string;
  order: number | null;
  categoryId: string | null;
  subcategoryId: string | null;
  assets: DocumentAsset[];
  localizations: Partial<Record<ContentLocale, DocumentLocalization>>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  /** Spanish projections retained while v2 clients and migrations coexist. */
  slug: string;
  originalFileName: string;
  status: DocumentStatus;
  metadata: DocumentMetadata;
  content: DocumentContent;
  publishedAt: string | null;
};

export type VersionedManifest = {
  manifest: DocumentManifest;
  etag: string;
};

export type VersionedDocument = VersionedManifest & {
  sources: Partial<Record<ContentLocale, string>>;
  /** Spanish compatibility alias for older clients. */
  source: string;
};

export type CatalogEntry = {
  id: string;
  locale: ContentLocale;
  slug: string;
  alternateSlugs: Partial<Record<ContentLocale, string>>;
  folder: string;
  metadata: DocumentMetadata;
  categoryId: string | null;
  subcategoryId: string | null;
  content: DocumentContent;
  updatedAt: string;
  publishedAt: string;
};

export type PublicCatalog = {
  schemaVersion: 3;
  locale: ContentLocale;
  generatedAt: string;
  documents: CatalogEntry[];
};

export type PublishedDocument = {
  entry: CatalogEntry;
  source: string;
  requestedLocale: ContentLocale;
  contentLocale: ContentLocale;
  usedFallback: boolean;
};

export type LocalizedTaxonomyLabel = {
  name: string;
  slug: string;
};

export type Subcategory = {
  id: string;
  localizations: Partial<Record<ContentLocale, LocalizedTaxonomyLabel>>;
  /** Spanish projection used by legacy UI. */
  name: string;
  slug: string;
};

export type Category = {
  id: string;
  localizations: Partial<Record<ContentLocale, LocalizedTaxonomyLabel>>;
  subcategories: Subcategory[];
  /** Spanish projection used by legacy UI. */
  name: string;
  slug: string;
};

export type Taxonomy = {
  schemaVersion: 2;
  categories: Category[];
  updatedAt: string;
};

export type VersionedTaxonomy = { taxonomy: Taxonomy; etag: string | null };

export type DocumentCleanupResult = {
  deletedFiles: number;
  deletedBytes: number;
  retainedFiles: number;
};

export type UploadedAssetInput = Omit<DocumentAsset, "id">;

export type CreateDocumentVariantInput = {
  locale: ContentLocale;
  slug: string;
  originalFileName: string;
  contentKind: DocumentContentKind;
  source: string;
  metadata: LocalizedDocumentMetadata;
};

export type CreateDocumentInput = {
  id: string;
  folder: string;
  canonicalKey: string;
  variants: CreateDocumentVariantInput[];
  assets: UploadedAssetInput[];
  order: number | null;
  categoryId: string | null;
  subcategoryId: string | null;
};

export type UpdateDocumentInput = {
  locale: ContentLocale;
  slug?: string;
  originalFileName?: string;
  contentKind?: DocumentContentKind;
  source: string;
  metadata: LocalizedDocumentMetadata;
  order: number | null;
  categoryId: string | null;
  subcategoryId: string | null;
  expectedEtag: string;
};

export function documentMetadata(
  manifest: DocumentManifest,
  locale: ContentLocale = "es",
): DocumentMetadata {
  const localization =
    manifest.localizations[locale] ?? manifest.localizations.es;
  if (!localization) {
    return {
      title: "",
      summary: "",
      author: "",
      tags: [],
      order: manifest.order,
      extra: {},
    };
  }
  return { ...localization.metadata, order: manifest.order };
}

export function taxonomyLabel(
  item: Category | Subcategory,
  locale: ContentLocale,
): LocalizedTaxonomyLabel | null {
  return item.localizations[locale] ?? item.localizations.es ?? null;
}

export function withManifestProjection(
  manifest: Omit<
    DocumentManifest,
    | "slug"
    | "originalFileName"
    | "status"
    | "metadata"
    | "content"
    | "publishedAt"
  > &
    Partial<
      Pick<
        DocumentManifest,
        | "slug"
        | "originalFileName"
        | "status"
        | "metadata"
        | "content"
        | "publishedAt"
      >
    >,
): DocumentManifest {
  const spanish = manifest.localizations.es;
  if (!spanish) {
    throw new TypeError("El manifiesto debe contener una versión en español.");
  }
  return {
    ...manifest,
    slug: spanish.slug,
    originalFileName: spanish.originalFileName,
    status: spanish.status,
    metadata: { ...spanish.metadata, order: manifest.order },
    content: spanish.content,
    publishedAt: spanish.publishedAt,
  };
}
