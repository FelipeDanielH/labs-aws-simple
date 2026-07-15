import type { ContentSearchIndex } from "../ports/content-search-index";
import type { ContentSearchPage } from "../../domain/entities/content-search-result";
import { ContentSearchError } from "../../domain/errors/content-search-error";
import type { ContentSearchQuery } from "../../domain/value-objects/content-search-query";

export class SearchContent {
  constructor(private readonly index: ContentSearchIndex) {}

  async execute(query: ContentSearchQuery): Promise<ContentSearchPage> {
    const offset = query.pagination?.offset ?? 0;
    const limit = query.pagination?.limit ?? 20;

    if (!Number.isInteger(offset) || offset < 0) {
      throw new ContentSearchError(
        "INVALID_QUERY",
        "offset debe ser un entero positivo.",
      );
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new ContentSearchError(
        "INVALID_QUERY",
        "limit debe estar entre 1 y 100.",
      );
    }

    return this.index.search({
      ...query,
      text: query.text?.trim() ?? "",
      pagination: { offset, limit },
    });
  }
}
