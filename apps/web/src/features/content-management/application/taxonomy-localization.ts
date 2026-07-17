import { slugify } from "./document-paths";
import type { ContentLocale, LocalizedTaxonomyLabel } from "../domain/models";

export type TaxonomyLocalizations = Partial<
  Record<ContentLocale, LocalizedTaxonomyLabel>
>;

export function updateLocalizedTaxonomyName(
  localizations: TaxonomyLocalizations,
  locale: ContentLocale,
  name: string,
): TaxonomyLocalizations {
  return {
    ...localizations,
    [locale]: {
      name,
      slug: localizations[locale]?.slug ?? "",
    },
  };
}

export function finalizeTaxonomyLocalizations(
  localizations: TaxonomyLocalizations,
  fallbackId: string,
): TaxonomyLocalizations & { es: LocalizedTaxonomyLabel } {
  const spanish = localizations.es;
  if (!spanish) {
    throw new Error("La traducción española es obligatoria.");
  }

  const finalized: TaxonomyLocalizations & {
    es: LocalizedTaxonomyLabel;
  } = {
    es: finalizeLabel(spanish, fallbackId),
  };
  const english = localizations.en;
  if (english?.name.trim()) {
    finalized.en = finalizeLabel(english, fallbackId);
  }
  return finalized;
}

function finalizeLabel(
  label: LocalizedTaxonomyLabel,
  fallbackId: string,
): LocalizedTaxonomyLabel {
  return {
    ...label,
    slug: label.slug || slugify(label.name || fallbackId),
  };
}
