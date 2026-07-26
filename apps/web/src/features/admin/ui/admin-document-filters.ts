import type { VersionedManifest } from "@/features/content-management/domain/models";

import type { DocumentStatusFilter } from "./admin-preferences";

export type AdminDocumentTaxonomyFilters = {
  /**
   * undefined matches every category, null matches documents without a
   * category and a string matches that category id.
   */
  categoryId?: string | null;
  /**
   * undefined matches every subcategory, null matches documents without a
   * subcategory and a string matches that subcategory id.
   */
  subcategoryId?: string | null;
};

export type AdminDocumentFilters = {
  status: DocumentStatusFilter;
  searchQuery: string;
  taxonomy: AdminDocumentTaxonomyFilters;
};

export function filterAdminDocuments(
  documents: VersionedManifest[],
  filters: AdminDocumentFilters,
): VersionedManifest[] {
  const normalizedQuery = normalizeAdminDocumentSearch(filters.searchQuery);
  return documents
    .filter((document) => matchesStatus(document, filters.status))
    .filter((document) => matchesSearch(document, normalizedQuery))
    .filter((document) => matchesTaxonomy(document, filters.taxonomy));
}

export function normalizeAdminDocumentSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase("es")
    .trim();
}

function matchesStatus(
  document: VersionedManifest,
  status: DocumentStatusFilter,
): boolean {
  return (
    status === "all" ||
    Object.values(document.manifest.localizations).some(
      (localization) => localization?.status === status,
    )
  );
}

function matchesSearch(
  document: VersionedManifest,
  normalizedQuery: string,
): boolean {
  if (!normalizedQuery) return true;
  return Object.values(document.manifest.localizations).some(
    (localization) =>
      localization &&
      normalizeAdminDocumentSearch(localization.metadata.title).includes(
        normalizedQuery,
      ),
  );
}

function matchesTaxonomy(
  document: VersionedManifest,
  filters: AdminDocumentTaxonomyFilters,
): boolean {
  const { categoryId, subcategoryId } = filters;
  if (categoryId !== undefined && document.manifest.categoryId !== categoryId) {
    return false;
  }
  return (
    subcategoryId === undefined ||
    document.manifest.subcategoryId === subcategoryId
  );
}
