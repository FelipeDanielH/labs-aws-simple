import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";

import {
  contentLocales,
  type ContentLocale,
  type DocumentManifest,
} from "../domain/models";
import { contentCacheTags } from "./content-cache-tags";

type DocumentCacheChange = {
  id: string;
  locales?: readonly ContentLocale[];
  oldSlugs?: Partial<Record<ContentLocale, string>>;
  newSlugs?: Partial<Record<ContentLocale, string>>;
  publicContentChanged?: boolean;
};

function expireTag(tag: string) {
  revalidateTag(tag, { expire: 0 });
}

export function invalidateTaxonomyCache() {
  expireTag(contentCacheTags.taxonomy);
  revalidatePath("/", "layout");
}

export function invalidateAdminDocumentsCache() {
  expireTag(contentCacheTags.adminDocuments);
}

export function invalidateCatalogCache(locale: ContentLocale) {
  expireTag(contentCacheTags.catalog(locale));
  revalidatePath(`/${locale}/laboratorios`, "page");
}

export function invalidateDocumentCache(change: DocumentCacheChange) {
  expireTag(contentCacheTags.document(change.id));
  expireTag(contentCacheTags.adminDocuments);

  if (!change.publicContentChanged) return;

  const locales = change.locales?.length ? change.locales : contentLocales;
  for (const locale of locales) {
    expireTag(contentCacheTags.catalog(locale));
    revalidatePath(`/${locale}/laboratorios`, "page");

    const slugs = new Set([
      change.oldSlugs?.[locale],
      change.newSlugs?.[locale],
    ]);
    for (const slug of slugs) {
      if (!slug) continue;
      revalidatePath(`/${locale}/laboratorios/${slug}`, "page");
      revalidatePath(`/${locale}/laboratorios/${slug}/contenido`);
    }
  }
}

export function invalidateManifestChange(
  previous: DocumentManifest | null,
  next: DocumentManifest | null,
) {
  const manifest = next ?? previous;
  if (!manifest) return;
  const locales = contentLocales.filter(
    (locale) =>
      publicFingerprint(previous, locale) !== publicFingerprint(next, locale),
  );
  invalidateDocumentCache({
    id: manifest.id,
    locales,
    oldSlugs: manifestSlugs(previous),
    newSlugs: manifestSlugs(next),
    publicContentChanged: locales.length > 0,
  });
}

export function invalidateAllContentCaches() {
  invalidateTaxonomyCache();
  expireTag(contentCacheTags.adminDocuments);
  for (const locale of contentLocales) {
    expireTag(contentCacheTags.catalog(locale));
    revalidatePath(`/${locale}/laboratorios`, "page");
  }
}

function manifestSlugs(
  manifest: DocumentManifest | null,
): Partial<Record<ContentLocale, string>> {
  return Object.fromEntries(
    contentLocales.flatMap((locale) => {
      const slug = manifest?.localizations[locale]?.slug;
      return slug ? [[locale, slug]] : [];
    }),
  );
}

function publicFingerprint(
  manifest: DocumentManifest | null,
  locale: ContentLocale,
) {
  const localization = manifest?.localizations[locale];
  if (!manifest || localization?.status !== "published") return "";
  return JSON.stringify({
    localization,
    order: manifest.order,
    categoryId: manifest.categoryId,
    subcategoryId: manifest.subcategoryId,
    alternateSlugs: Object.fromEntries(
      contentLocales.flatMap((candidate) => {
        const alternate = manifest.localizations[candidate];
        return alternate?.status === "published"
          ? [[candidate, alternate.slug]]
          : [];
      }),
    ),
  });
}
