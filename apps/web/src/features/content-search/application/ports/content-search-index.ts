import type { ContentSearchPage } from "../../domain/entities/content-search-result";
import type { SearchableContent } from "../../domain/entities/searchable-content";
import type { ContentSearchQuery } from "../../domain/value-objects/content-search-query";

export interface ContentSearchIndex {
  replaceAll(documents: readonly SearchableContent[]): Promise<void>;
  upsert(documents: readonly SearchableContent[]): Promise<void>;
  remove(ids: readonly string[]): Promise<void>;
  clear(): Promise<void>;
  search(query: ContentSearchQuery): Promise<ContentSearchPage>;
}
