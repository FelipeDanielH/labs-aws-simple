import type { ContentSearchIndex } from "../ports/content-search-index";
import type { SearchableContent } from "../../domain/entities/searchable-content";
import { ContentSearchError } from "../../domain/errors/content-search-error";

export class ManageContentIndex {
  constructor(private readonly index: ContentSearchIndex) {}

  async replaceAll(documents: readonly SearchableContent[]): Promise<void> {
    validateDocuments(documents, true);
    await this.index.replaceAll(documents);
  }

  async upsert(documents: readonly SearchableContent[]): Promise<void> {
    validateDocuments(documents, false);
    await this.index.upsert(documents);
  }

  async remove(ids: readonly string[]): Promise<void> {
    await this.index.remove([...new Set(ids.filter(Boolean))]);
  }

  async clear(): Promise<void> {
    await this.index.clear();
  }
}

function validateDocuments(
  documents: readonly SearchableContent[],
  rejectDuplicateIds: boolean,
): void {
  const ids = new Set<string>();

  for (const document of documents) {
    if (
      !document.id.trim() ||
      !document.kind.trim() ||
      !document.title.trim()
    ) {
      throw new ContentSearchError(
        "INVALID_DOCUMENT",
        "Cada contenido indexable requiere id, kind y title.",
      );
    }

    if (rejectDuplicateIds && ids.has(document.id)) {
      throw new ContentSearchError(
        "DUPLICATE_DOCUMENT_ID",
        `El identificador "${document.id}" está repetido.`,
      );
    }

    ids.add(document.id);
  }
}
