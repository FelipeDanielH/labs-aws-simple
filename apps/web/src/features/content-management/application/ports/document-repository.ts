import type {
  CreateDocumentInput,
  DocumentStatus,
  PublicCatalog,
  UpdateDocumentInput,
  VersionedDocument,
  VersionedManifest,
} from "../../domain/models";

export interface DocumentRepository {
  list(status?: DocumentStatus): Promise<VersionedManifest[]>;
  findById(id: string): Promise<VersionedDocument | null>;
  findPublishedBySlug(slug: string): Promise<VersionedDocument | null>;
  create(input: CreateDocumentInput): Promise<VersionedDocument>;
  update(id: string, input: UpdateDocumentInput): Promise<VersionedDocument>;
  transition(
    id: string,
    status: DocumentStatus,
    expectedEtag: string,
  ): Promise<VersionedManifest>;
  purge(id: string): Promise<void>;
  getPublicCatalog(): Promise<PublicCatalog>;
  rebuildPublicCatalog(): Promise<PublicCatalog>;
}
