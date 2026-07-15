import { ManageContentIndex } from "./application/use-cases/manage-content-index";
import { SearchContent } from "./application/use-cases/search-content";
import { MiniSearchContentIndex } from "./infrastructure/indexes/minisearch-content-index";

export type { ContentSearchIndex } from "./application/ports/content-search-index";
export { ManageContentIndex } from "./application/use-cases/manage-content-index";
export { SearchContent } from "./application/use-cases/search-content";
export type {
  ContentSearchFacets,
  ContentSearchHit,
  ContentSearchPage,
} from "./domain/entities/content-search-result";
export type {
  ContentHierarchy,
  SearchableContent,
  SearchAttributeScalar,
  SearchAttributeValue,
} from "./domain/entities/searchable-content";
export {
  ContentSearchError,
  type ContentSearchErrorCode,
} from "./domain/errors/content-search-error";
export type {
  ContentSearchFilters,
  ContentSearchQuery,
} from "./domain/value-objects/content-search-query";
export {
  mapMarkdownToSearchableContent,
  type MarkdownSearchMetadata,
} from "./infrastructure/mappers/markdown-search-document-mapper";

export type LocalContentSearch = {
  manage: ManageContentIndex;
  search: SearchContent;
};

export function createLocalContentSearch(): LocalContentSearch {
  const adapter = new MiniSearchContentIndex();
  return {
    manage: new ManageContentIndex(adapter),
    search: new SearchContent(adapter),
  };
}
