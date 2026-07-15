import { ContentManagementError } from "../domain/errors";
import type { Taxonomy } from "../domain/models";

export function assertTaxonomySelection(
  taxonomy: Taxonomy,
  categoryId: string | null,
  subcategoryId: string | null,
): void {
  if (!categoryId) {
    if (subcategoryId) invalid();
    return;
  }
  const category = taxonomy.categories.find((item) => item.id === categoryId);
  if (!category) invalid();
  if (
    subcategoryId &&
    !category.subcategories.some((item) => item.id === subcategoryId)
  ) {
    invalid();
  }
}

function invalid(): never {
  throw new ContentManagementError(
    "INVALID_INPUT",
    "La categoría o subcategoría seleccionada no es válida.",
  );
}
