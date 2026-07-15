import type { Taxonomy, VersionedTaxonomy } from "../../domain/models";

export interface TaxonomyRepository {
  get(): Promise<VersionedTaxonomy>;
  save(
    taxonomy: Taxonomy,
    expectedEtag: string | null,
  ): Promise<VersionedTaxonomy>;
}
