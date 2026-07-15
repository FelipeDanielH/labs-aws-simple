import type { SearchableContent } from "./searchable-content";

export type ContentSearchHit = {
  document: SearchableContent;
  score: number;
  terms: readonly string[];
  matches: Readonly<Record<string, readonly string[]>>;
};

export type ContentSearchFacets = {
  kinds: Readonly<Record<string, number>>;
  categories: Readonly<Record<string, number>>;
  tags: Readonly<Record<string, number>>;
};

export type ContentSearchPage = {
  hits: readonly ContentSearchHit[];
  total: number;
  offset: number;
  limit: number;
  facets: ContentSearchFacets;
};
