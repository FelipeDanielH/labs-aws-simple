export type DocumentStatus = "draft" | "published" | "trashed";

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
  pathname: string;
  url: string;
  contentType: string;
  size: number;
  sha256: string;
};

export type DocumentManifest = {
  schemaVersion: 1;
  id: string;
  slug: string;
  folder: string;
  originalFileName: string;
  status: DocumentStatus;
  metadata: DocumentMetadata;
  categoryId: string | null;
  subcategoryId: string | null;
  markdownPathname: string;
  markdownUrl: string;
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
  markdown: string;
};

export type CatalogEntry = Pick<
  DocumentManifest,
  | "id"
  | "slug"
  | "metadata"
  | "categoryId"
  | "subcategoryId"
  | "markdownUrl"
  | "updatedAt"
  | "publishedAt"
> & { folder: string };

export type PublicCatalog = {
  schemaVersion: 1;
  generatedAt: string;
  documents: CatalogEntry[];
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

export type UploadedAssetInput = Omit<DocumentAsset, "id">;

export type CreateDocumentInput = {
  id: string;
  slug: string;
  folder: string;
  originalFileName: string;
  markdown: string;
  assets: UploadedAssetInput[];
  metadata: DocumentMetadata;
  categoryId: string | null;
  subcategoryId: string | null;
};

export type UpdateDocumentInput = {
  markdown: string;
  metadata: DocumentMetadata;
  categoryId: string | null;
  subcategoryId: string | null;
  expectedEtag: string;
};
