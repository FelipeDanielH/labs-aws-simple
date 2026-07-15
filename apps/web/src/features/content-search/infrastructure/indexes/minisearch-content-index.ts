import MiniSearch from "minisearch";

import type { ContentSearchIndex } from "../../application/ports/content-search-index";
import type {
  ContentSearchFacets,
  ContentSearchHit,
  ContentSearchPage,
} from "../../domain/entities/content-search-result";
import type {
  SearchableContent,
  SearchAttributeScalar,
  SearchAttributeValue,
} from "../../domain/entities/searchable-content";
import type {
  ContentSearchFilters,
  ContentSearchQuery,
} from "../../domain/value-objects/content-search-query";

type IndexedContent = {
  id: string;
  title: string;
  summary: string;
  content: string;
  tagsText: string;
  pathText: string;
};

export class MiniSearchContentIndex implements ContentSearchIndex {
  private index = createIndex();
  private readonly documents = new Map<string, SearchableContent>();

  async replaceAll(documents: readonly SearchableContent[]): Promise<void> {
    this.index = createIndex();
    this.documents.clear();

    if (documents.length > 0) {
      this.index.addAll(documents.map(toIndexedContent));
      for (const document of documents)
        this.documents.set(document.id, document);
    }
  }

  async upsert(documents: readonly SearchableContent[]): Promise<void> {
    for (const document of documents) {
      const indexedDocument = toIndexedContent(document);
      if (this.documents.has(document.id)) {
        this.index.replace(indexedDocument);
      } else {
        this.index.add(indexedDocument);
      }
      this.documents.set(document.id, document);
    }
  }

  async remove(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      if (!this.documents.has(id)) continue;
      this.index.discard(id);
      this.documents.delete(id);
    }
  }

  async clear(): Promise<void> {
    this.index = createIndex();
    this.documents.clear();
  }

  async search(query: ContentSearchQuery): Promise<ContentSearchPage> {
    const text = query.text?.trim() ?? "";
    const offset = query.pagination?.offset ?? 0;
    const limit = query.pagination?.limit ?? 20;
    const matches = text
      ? this.searchText(text, query)
      : this.getAll(query.filters);
    const sortedMatches = sortHits(matches, query);
    const facets = createFacets(sortedMatches);

    return {
      hits: sortedMatches.slice(offset, offset + limit),
      total: sortedMatches.length,
      offset,
      limit,
      facets,
    };
  }

  private searchText(
    text: string,
    query: ContentSearchQuery,
  ): ContentSearchHit[] {
    const fuzzy = query.matching?.fuzzy ?? 0.2;
    const prefix = query.matching?.prefix ?? true;
    const combineWith = query.matching?.operator === "or" ? "OR" : "AND";

    return this.index
      .search(text, {
        boost: {
          title: 5,
          tagsText: 3,
          pathText: 2.5,
          summary: 2,
          content: 1,
        },
        combineWith,
        fuzzy: (term) => (term.length >= 4 ? fuzzy : false),
        prefix,
        filter: (result) => {
          const document = this.documents.get(String(result.id));
          return document ? matchesFilters(document, query.filters) : false;
        },
      })
      .flatMap((result) => {
        const document = this.documents.get(String(result.id));
        if (!document) return [];

        return [
          {
            document,
            score: result.score,
            terms: result.terms,
            matches: Object.fromEntries(
              Object.entries(result.match).map(([term, fields]) => [
                term,
                [...fields],
              ]),
            ),
          },
        ];
      });
  }

  private getAll(filters?: ContentSearchFilters): ContentSearchHit[] {
    return [...this.documents.values()]
      .filter((document) => matchesFilters(document, filters))
      .map((document) => ({ document, score: 0, terms: [], matches: {} }));
  }
}

function createIndex(): MiniSearch<IndexedContent> {
  return new MiniSearch<IndexedContent>({
    idField: "id",
    fields: ["title", "summary", "content", "tagsText", "pathText"],
    processTerm: (term) => normalizeSearchText(term) || null,
    searchOptions: {
      combineWith: "AND",
      prefix: true,
    },
  });
}

function toIndexedContent(document: SearchableContent): IndexedContent {
  return {
    id: document.id,
    title: document.title,
    summary: document.summary,
    content: document.content,
    tagsText: document.tags.join(" "),
    pathText: document.hierarchy.path.join(" "),
  };
}

function matchesFilters(
  document: SearchableContent,
  filters?: ContentSearchFilters,
): boolean {
  if (!filters) return true;

  if (filters.kinds?.length && !contains(filters.kinds, document.kind))
    return false;
  if (
    filters.categoryIds?.length &&
    !overlaps(document.categoryIds, filters.categoryIds)
  ) {
    return false;
  }
  if (
    filters.ancestorIds?.length &&
    !overlaps(document.hierarchy.ancestorIds, filters.ancestorIds)
  ) {
    return false;
  }
  if (filters.tags?.length && !overlaps(document.tags, filters.tags))
    return false;

  return Object.entries(filters.attributes ?? {}).every(([key, expected]) =>
    matchesAttribute(document.attributes[key], expected),
  );
}

function matchesAttribute(
  actual: SearchAttributeValue | undefined,
  expected: SearchAttributeValue,
): boolean {
  if (actual === undefined) return false;
  const actualValues = Array.isArray(actual) ? actual : [actual];
  const expectedValues = Array.isArray(expected) ? expected : [expected];

  return expectedValues.some((expectedValue) =>
    actualValues.some((actualValue) => equalScalar(actualValue, expectedValue)),
  );
}

function equalScalar(
  left: SearchAttributeScalar,
  right: SearchAttributeScalar,
): boolean {
  if (typeof left === "string" && typeof right === "string") {
    return normalizeSearchText(left) === normalizeSearchText(right);
  }
  return left === right;
}

function overlaps(left: readonly string[], right: readonly string[]): boolean {
  const normalizedRight = new Set(right.map(normalizeSearchText));
  return left.some((value) => normalizedRight.has(normalizeSearchText(value)));
}

function contains(values: readonly string[], expected: string): boolean {
  const normalizedExpected = normalizeSearchText(expected);
  return values.some(
    (value) => normalizeSearchText(value) === normalizedExpected,
  );
}

function sortHits(
  hits: ContentSearchHit[],
  query: ContentSearchQuery,
): ContentSearchHit[] {
  const by = query.sort?.by ?? "relevance";
  const direction =
    query.sort?.direction ?? (by === "relevance" ? "desc" : "asc");
  const multiplier = direction === "asc" ? 1 : -1;

  return [...hits].sort((left, right) => {
    let comparison = 0;
    if (by === "title") {
      comparison = left.document.title.localeCompare(right.document.title);
    } else if (by === "order") {
      comparison =
        (left.document.order ?? Number.MAX_SAFE_INTEGER) -
        (right.document.order ?? Number.MAX_SAFE_INTEGER);
    } else {
      comparison = left.score - right.score;
    }

    return comparison === 0
      ? left.document.title.localeCompare(right.document.title)
      : comparison * multiplier;
  });
}

function createFacets(hits: readonly ContentSearchHit[]): ContentSearchFacets {
  const kinds: Record<string, number> = {};
  const categories: Record<string, number> = {};
  const tags: Record<string, number> = {};

  for (const { document } of hits) {
    increment(kinds, document.kind);
    for (const category of document.categoryIds)
      increment(categories, category);
    for (const tag of document.tags) increment(tags, tag);
  }

  return { kinds, categories, tags };
}

function increment(facet: Record<string, number>, key: string): void {
  facet[key] = (facet[key] ?? 0) + 1;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}
