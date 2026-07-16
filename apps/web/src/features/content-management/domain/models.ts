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

export type DocumentManifest = {
  schemaVersion: 2;
  id: string;
  slug: string;
  folder: string;
  originalFileName: string;
  status: DocumentStatus;
  metadata: DocumentMetadata;
  categoryId: string | null;
  subcategoryId: string | null;
  content: DocumentContent;
  assets: DocumentAsset[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  deletedAt: string | null;
};

export type VersionedManifest = {
  manifest: DocumentManifest;
  etag: string;
};

export type VersionedDocument = VersionedManifest & {
  source: string;
};

export type CatalogEntry = Pick<
  DocumentManifest,
  | "id"
  | "slug"
  | "folder"
  | "metadata"
  | "categoryId"
  | "subcategoryId"
  | "content"
  | "updatedAt"
  | "publishedAt"
>;

export type PublicCatalog = {
  schemaVersion: 2;
  generatedAt: string;
  documents: CatalogEntry[];
};

export type PublishedDocument = {
  entry: CatalogEntry;
  source: string;
};

export type Subcategory = { id: string; slug: string; name: string };
export type Category = {
  id: string;
  slug: string;
  name: string;
  subcategories: Subcategory[];
};

export type Taxonomy = {
  schemaVersion: 1;
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

export type CreateDocumentInput = {
  id: string;
  slug: string;
  folder: string;
  originalFileName: string;
  contentKind: DocumentContentKind;
  source: string;
  assets: UploadedAssetInput[];
  metadata: DocumentMetadata;
  categoryId: string | null;
  subcategoryId: string | null;
};

export type UpdateDocumentInput = {
  source: string;
  metadata: DocumentMetadata;
  categoryId: string | null;
  subcategoryId: string | null;
  expectedEtag: string;
};
