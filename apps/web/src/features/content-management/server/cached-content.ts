import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";

import type {
  ContentLocale,
  PublishedDocument,
  PublicCatalog,
  VersionedDocument,
  VersionedManifest,
  VersionedTaxonomy,
} from "../domain/models";
import { getContentRepository } from "./container";
import { contentCacheTags } from "./content-cache-tags";

const PUBLIC_CACHE_LIFE = {
  stale: 300,
  revalidate: 604_800,
  expire: 2_592_000,
};

async function loadPublicCatalog(
  locale: ContentLocale,
): Promise<PublicCatalog> {
  "use cache: remote";
  cacheLife(PUBLIC_CACHE_LIFE);
  cacheTag(contentCacheTags.catalog(locale));
  try {
    return await getContentRepository().getPublicCatalog(locale);
  } catch (error) {
    if (isMissingBlobConfiguration(error)) {
      return {
        schemaVersion: 3,
        locale,
        generatedAt: new Date(0).toISOString(),
        documents: [],
      };
    }
    throw error;
  }
}

async function loadTaxonomy(): Promise<VersionedTaxonomy> {
  "use cache: remote";
  cacheLife(PUBLIC_CACHE_LIFE);
  cacheTag(contentCacheTags.taxonomy);
  try {
    return await getContentRepository().get();
  } catch (error) {
    if (isMissingBlobConfiguration(error)) {
      return {
        taxonomy: {
          schemaVersion: 2,
          categories: [],
          updatedAt: new Date(0).toISOString(),
        },
        etag: null,
      };
    }
    throw error;
  }
}

async function loadPublishedDocument(
  slug: string,
  locale: ContentLocale,
): Promise<PublishedDocument | null> {
  "use cache: remote";
  cacheLife(PUBLIC_CACHE_LIFE);
  cacheTag(contentCacheTags.catalog(locale));
  const requestedCatalog = await loadPublicCatalog(locale);
  let entry = requestedCatalog.documents.find((item) => item.slug === slug);

  if (!entry && locale === "en") {
    cacheTag(contentCacheTags.catalog("es"));
    const spanishCatalog = await loadPublicCatalog("es");
    const spanishEntry = spanishCatalog.documents.find(
      (item) => item.slug === slug,
    );
    if (spanishEntry) {
      entry =
        requestedCatalog.documents.find(
          (item) => item.id === spanishEntry.id,
        ) ?? spanishEntry;
    }
  }
  if (!entry) return null;

  cacheTag(contentCacheTags.document(entry.id));
  const response = await fetch(entry.content.url, { cache: "force-cache" });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error("No se pudo leer el contenido publicado.");
  }
  return {
    entry,
    source: await response.text(),
    requestedLocale: locale,
    contentLocale: entry.locale,
    usedFallback: entry.locale !== locale,
  };
}

async function loadAdminDocuments(): Promise<VersionedManifest[]> {
  "use cache: remote";
  cacheLife({ stale: 60, revalidate: 1_800, expire: 3_600 });
  cacheTag(contentCacheTags.adminDocuments);
  return getContentRepository().list();
}

async function loadAdminTaxonomy(): Promise<VersionedTaxonomy> {
  "use cache: remote";
  cacheLife({ stale: 60, revalidate: 1_800, expire: 3_600 });
  cacheTag(contentCacheTags.taxonomy);
  return getContentRepository().get();
}

async function loadAdminDocument(
  id: string,
): Promise<VersionedDocument | null> {
  "use cache: remote";
  cacheLife({ stale: 60, revalidate: 1_800, expire: 3_600 });
  cacheTag(contentCacheTags.adminDocuments, contentCacheTags.document(id));
  return getContentRepository().findById(id);
}

async function loadAdminDocumentByCanonicalKey(
  canonicalKey: string,
): Promise<VersionedManifest | null> {
  "use cache: remote";
  cacheLife({ stale: 60, revalidate: 1_800, expire: 3_600 });
  cacheTag(contentCacheTags.adminDocuments);
  return getContentRepository().findByCanonicalKey(canonicalKey);
}

export const getCachedPublicCatalog = cache(loadPublicCatalog);
export const getCachedTaxonomy = cache(loadTaxonomy);
export const getCachedPublishedDocument = cache(loadPublishedDocument);
export const getCachedAdminDocuments = cache(loadAdminDocuments);
export const getCachedAdminDocument = cache(loadAdminDocument);
export const getCachedAdminDocumentByCanonicalKey = cache(
  loadAdminDocumentByCanonicalKey,
);
export const getCachedAdminTaxonomy = cache(loadAdminTaxonomy);

function isMissingBlobConfiguration(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes("No blob credentials found") ||
      error.message.includes("todavía no está conectado"))
  );
}
