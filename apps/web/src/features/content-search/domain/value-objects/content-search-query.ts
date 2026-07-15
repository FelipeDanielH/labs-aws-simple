import type { SearchAttributeValue } from "../entities/searchable-content";

export type ContentSearchFilters = {
  kinds?: readonly string[];
  categoryIds?: readonly string[];
  ancestorIds?: readonly string[];
  tags?: readonly string[];
  attributes?: Readonly<Record<string, SearchAttributeValue>>;
};

export type ContentSearchQuery = {
  text?: string;
  filters?: ContentSearchFilters;
  matching?: {
    prefix?: boolean;
    fuzzy?: boolean | number;
    operator?: "and" | "or";
  };
  pagination?: {
    offset?: number;
    limit?: number;
  };
  sort?: {
    by: "relevance" | "title" | "order";
    direction?: "asc" | "desc";
  };
};
