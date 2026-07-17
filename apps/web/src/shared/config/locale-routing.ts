import {
  contentLocales,
  taxonomyLabel,
  type Category,
  type ContentLocale,
  type Taxonomy,
} from "@/features/content-management/domain/models";

export const localeCookieName = "aws-labs-locale";

export function isContentLocale(value: string): value is ContentLocale {
  return contentLocales.includes(value as ContentLocale);
}

export function localizeTaxonomy(
  taxonomy: Taxonomy,
  locale: ContentLocale,
): Taxonomy {
  return {
    ...taxonomy,
    categories: taxonomy.categories.map((category) =>
      localizeCategory(category, locale),
    ),
  };
}

function localizeCategory(category: Category, locale: ContentLocale): Category {
  const label = taxonomyLabel(category, locale) ?? {
    name: "",
    slug: category.id,
  };
  return {
    ...category,
    ...label,
    subcategories: category.subcategories.map((subcategory) => ({
      ...subcategory,
      ...(taxonomyLabel(subcategory, locale) ?? {
        name: "",
        slug: subcategory.id,
      }),
    })),
  };
}
