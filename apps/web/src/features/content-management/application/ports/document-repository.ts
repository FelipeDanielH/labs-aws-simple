import type {
  CreateDocumentInput,
  DocumentManifest,
  DocumentStatus,
  PublicCatalog,
  UpdateDocumentInput,
  VersionedDocument,
} from "../../domain/models";

export interface DocumentRepository {
  list(status?: DocumentStatus): Promise<DocumentManifest[]>;
  findById(id: string): Promise<VersionedDocument | null>;
  findPublishedBySlug(slug: string): Promise<VersionedDocument | null>;
  create(input: CreateDocumentInput): Promise<VersionedDocument>;
  update(id: string, input: UpdateDocumentInput): Promise<VersionedDocument>;
  transition(
    id: string,
    status: DocumentStatus,
    expectedEtag: string,
  ): Promise<VersionedDocument>;
  purge(id: string): Promise<void>;
  getPublicCatalog(): Promise<PublicCatalog>;
  rebuildPublicCatalog(): Promise<PublicCatalog>;
}
