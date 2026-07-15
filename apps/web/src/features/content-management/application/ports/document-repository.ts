import type {
  CreateDocumentInput,
  DocumentCleanupResult,
  DocumentStatus,
  PublishedDocument,
  PublicCatalog,
  UpdateDocumentInput,
  VersionedDocument,
  VersionedManifest,
} from "../../domain/models";

export interface DocumentRepository {
  list(status?: DocumentStatus): Promise<VersionedManifest[]>;
  findById(id: string): Promise<VersionedDocument | null>;
  findPublishedBySlug(slug: string): Promise<PublishedDocument | null>;
  create(input: CreateDocumentInput): Promise<VersionedDocument>;
  update(id: string, input: UpdateDocumentInput): Promise<VersionedDocument>;
  transition(
    id: string,
    status: DocumentStatus,
    expectedEtag: string,
  ): Promise<VersionedManifest>;
  purge(id: string): Promise<void>;
  cleanupVersions(
    id: string,
    expectedEtag: string,
  ): Promise<DocumentCleanupResult>;
  getPublicCatalog(): Promise<PublicCatalog>;
  rebuildPublicCatalog(): Promise<PublicCatalog>;
}
