import type {
  CreateDocumentInput,
  ContentLocale,
  DocumentCleanupResult,
  DocumentStatus,
  PublishedDocument,
  PublicCatalog,
  ReplaceDocumentInput,
  UpdateDocumentInput,
  VersionedDocument,
  VersionedManifest,
} from "../../domain/models";

export interface DocumentRepository {
  list(status?: DocumentStatus): Promise<VersionedManifest[]>;
  findById(id: string): Promise<VersionedDocument | null>;
  findPublishedBySlug(
    slug: string,
    locale: ContentLocale,
  ): Promise<PublishedDocument | null>;
  create(input: CreateDocumentInput): Promise<VersionedDocument>;
  update(id: string, input: UpdateDocumentInput): Promise<VersionedDocument>;
  replace(
    id: string,
    input: ReplaceDocumentInput,
  ): Promise<VersionedDocument>;
  publishAvailable(
    id: string,
    expectedEtag: string,
  ): Promise<VersionedManifest>;
  transition(
    id: string,
    status: DocumentStatus,
    expectedEtag: string,
    locale?: ContentLocale,
  ): Promise<VersionedManifest>;
  purge(id: string): Promise<void>;
  cleanupVersions(
    id: string,
    expectedEtag: string,
  ): Promise<DocumentCleanupResult>;
  getPublicCatalog(locale?: ContentLocale): Promise<PublicCatalog>;
  rebuildPublicCatalog(locale?: ContentLocale): Promise<PublicCatalog>;
}
