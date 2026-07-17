import "server-only";

import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  del,
  head,
  list,
  put,
} from "@vercel/blob";

import { cleanupRemainingMinutes } from "../../application/document-retention";
import { contentPaths, createShortId } from "../../application/document-paths";
import type { DocumentRepository } from "../../application/ports/document-repository";
import type { TaxonomyRepository } from "../../application/ports/taxonomy-repository";
import { ContentManagementError } from "../../domain/errors";
import { withManifestProjection } from "../../domain/models";
import type {
  CatalogEntry,
  ContentLocale,
  CreateDocumentInput,
  DocumentCleanupResult,
  DocumentContent,
  DocumentLocalization,
  DocumentManifest,
  DocumentStatus,
  PublicCatalog,
  PublishedDocument,
  Taxonomy,
  UpdateDocumentInput,
  VersionedDocument,
  VersionedManifest,
  VersionedTaxonomy,
} from "../../domain/models";
import { normalizeBlobEtag, versionedBlobUrl } from "./blob-etag";
import {
  normalizeDocumentManifest,
  normalizePublicCatalog,
  normalizeTaxonomy,
} from "./content-normalization";

interface LocatedBlob {
  pathname: string;
  url: string;
  etag: string;
}

export type MigrationMode = "dry-run" | "apply" | "verify";
export type MigrationResult = {
  mode: MigrationMode;
  inspected: number;
  migrated: number;
  alreadyMigrated: number;
  taxonomy: "unchanged" | "pending" | "migrated" | "verified";
  errors: string[];
};

export class VercelBlobContentRepository
  implements DocumentRepository, TaxonomyRepository
{
  async list(status?: DocumentStatus): Promise<VersionedManifest[]> {
    const manifests = await this.listManifests();
    return manifests
      .filter(
        ({ manifest }) =>
          !status ||
          Object.values(manifest.localizations).some(
            (localization) => localization?.status === status,
          ),
      )
      .sort((left, right) =>
        right.manifest.updatedAt.localeCompare(left.manifest.updatedAt),
      );
  }

  async findById(id: string): Promise<VersionedDocument | null> {
    const match = await this.findManifestById(id);
    return match ? this.withContent(match.manifest, match.etag) : null;
  }

  async findPublishedBySlug(
    slug: string,
    locale: ContentLocale,
  ): Promise<PublishedDocument | null> {
    const requestedCatalog = await this.getPublicCatalog(locale);
    let entry = requestedCatalog.documents.find((item) => item.slug === slug);

    if (!entry && locale === "en") {
      const spanishCatalog = await this.getPublicCatalog("es");
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

    const response = await fetch(entry.content.url, { cache: "no-store" });
    if (response.status === 404) return null;
    if (!response.ok) this.storageFailure("leer el contenido publicado");
    return {
      entry,
      source: await response.text(),
      requestedLocale: locale,
      contentLocale: entry.locale,
      usedFallback: entry.locale !== locale,
    };
  }

  async create(input: CreateDocumentInput): Promise<VersionedDocument> {
    this.assertConfigured();
    const spanish = input.variants.find((variant) => variant.locale === "es");
    if (!spanish) this.invalid("La versión en español es obligatoria.");
    const manifests = await this.listManifests();
    if (
      manifests.some(
        ({ manifest }) => manifest.canonicalKey === input.canonicalKey,
      )
    ) {
      this.invalid("Ya existe un laboratorio asociado a ese archivo.");
    }
    for (const variant of input.variants) {
      this.assertUniqueSlug(manifests, variant.locale, variant.slug);
    }

    const markerPath = contentPaths.duplicateKey(input.canonicalKey);
    if (await this.locateBlob(markerPath)) {
      this.invalid("Ya existe un laboratorio asociado a ese archivo.");
    }
    await this.writeJson(markerPath, {
      documentId: input.id,
      canonicalKey: input.canonicalKey,
      folder: input.folder,
    });

    const now = new Date().toISOString();
    const createdUrls: string[] = [];
    try {
      const localizations: DocumentManifest["localizations"] = {};
      for (const variant of input.variants) {
        const content = await this.writeContent(
          input.folder,
          variant.locale,
          variant.contentKind,
          variant.source,
        );
        createdUrls.push(content.url);
        localizations[variant.locale] = {
          locale: variant.locale,
          slug: variant.slug,
          originalFileName: variant.originalFileName,
          status: "draft",
          metadata: variant.metadata,
          content,
          createdAt: now,
          updatedAt: now,
          publishedAt: null,
          deletedAt: null,
        };
      }
      const manifest = withManifestProjection({
        schemaVersion: 3,
        id: input.id,
        folder: input.folder,
        canonicalKey: input.canonicalKey,
        order: input.order,
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId,
        assets: input.assets.map((asset) => ({
          ...asset,
          id: createShortId(),
        })),
        localizations,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      const stored = await this.writeJson(
        contentPaths.manifest(input.folder),
        manifest,
      );
      return {
        manifest,
        etag: stored.etag,
        sources: Object.fromEntries(
          input.variants.map((variant) => [variant.locale, variant.source]),
        ),
        source: spanish.source,
      };
    } catch (error) {
      if (createdUrls.length) await del(createdUrls).catch(() => undefined);
      await del(markerPath).catch(() => undefined);
      this.rethrowStorageError(error);
    }
  }

  async update(
    id: string,
    input: UpdateDocumentInput,
  ): Promise<VersionedDocument> {
    const current = await this.requireManifest(id);
    if (current.etag !== input.expectedEtag) this.throwConflict();
    const existing = current.manifest.localizations[input.locale];
    const manifests = await this.listManifests();
    const slug = existing?.slug ?? input.slug;
    if (!slug) this.invalid("Falta el slug del nuevo idioma.");
    this.assertUniqueSlug(manifests, input.locale, slug, id);

    const kind = input.contentKind ?? existing?.content.kind;
    if (!kind) this.invalid("Falta el tipo de contenido.");
    const content = await this.writeContent(
      current.manifest.folder,
      input.locale,
      kind,
      input.source,
    );
    const now = new Date().toISOString();
    const localization: DocumentLocalization = {
      locale: input.locale,
      slug,
      originalFileName:
        existing?.originalFileName ?? input.originalFileName ?? `${slug}.md`,
      status: existing?.status ?? "draft",
      metadata: input.metadata,
      content,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      publishedAt: existing?.publishedAt ?? null,
      deletedAt: existing?.deletedAt ?? null,
    };
    const manifest = withManifestProjection({
      ...current.manifest,
      order: input.order,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      localizations: {
        ...current.manifest.localizations,
        [input.locale]: localization,
      },
      updatedAt: now,
    });
    try {
      const stored = await this.writeJson(
        contentPaths.manifest(manifest.folder),
        manifest,
        input.expectedEtag,
      );
      if (localization.status === "published")
        await this.syncCatalogs(manifest);
      const document = await this.withContent(manifest, stored.etag);
      document.sources[input.locale] = input.source;
      if (input.locale === "es") document.source = input.source;
      return document;
    } catch (error) {
      await del(content.url).catch(() => undefined);
      this.rethrowStorageError(error);
    }
  }

  async removeLocale(
    id: string,
    locale: ContentLocale,
    expectedEtag: string,
  ): Promise<VersionedManifest> {
    if (locale === "es") this.invalid("La versión en español es obligatoria.");
    const current = await this.requireManifest(id);
    if (current.etag !== expectedEtag) this.throwConflict();
    const existing = current.manifest.localizations[locale];
    if (!existing) return current;
    if (existing.status === "published") {
      this.invalid("Despublica el idioma antes de eliminarlo.");
    }
    const localizations = { ...current.manifest.localizations };
    delete localizations[locale];
    const manifest = withManifestProjection({
      ...current.manifest,
      localizations,
      updatedAt: new Date().toISOString(),
    });
    const stored = await this.writeJson(
      contentPaths.manifest(manifest.folder),
      manifest,
      expectedEtag,
    );
    await this.syncCatalogs(manifest);
    return { manifest, etag: stored.etag };
  }

  async transition(
    id: string,
    status: DocumentStatus,
    expectedEtag: string,
    locale: ContentLocale = "es",
  ): Promise<VersionedManifest> {
    const current = await this.requireManifest(id);
    if (current.etag !== expectedEtag) this.throwConflict();
    const existing = current.manifest.localizations[locale];
    if (!existing) this.invalid("El idioma seleccionado no existe.");
    assertTransition(existing.status, status);

    const spanish = current.manifest.localizations.es;
    if (locale !== "es" && status === "published") {
      if (spanish?.status !== "published") {
        this.invalid("Publica primero la versión en español.");
      }
      const { taxonomy } = await this.get();
      this.assertTranslatedTaxonomy(
        taxonomy,
        current.manifest.categoryId,
        current.manifest.subcategoryId,
        locale,
      );
    }
    if (
      locale === "es" &&
      status !== "published" &&
      Object.entries(current.manifest.localizations).some(
        ([key, localization]) =>
          key !== "es" && localization?.status === "published",
      )
    ) {
      this.invalid(
        "Despublica los demás idiomas antes de despublicar español.",
      );
    }

    const now = new Date().toISOString();
    const updated: DocumentLocalization = {
      ...existing,
      status,
      updatedAt: now,
      publishedAt:
        status === "published"
          ? (existing.publishedAt ?? now)
          : existing.publishedAt,
      deletedAt: status === "trashed" ? now : null,
    };
    const manifest = withManifestProjection({
      ...current.manifest,
      localizations: {
        ...current.manifest.localizations,
        [locale]: updated,
      },
      updatedAt: now,
      deletedAt:
        status === "trashed" && locale === "es"
          ? now
          : current.manifest.deletedAt,
    });
    try {
      const stored = await this.writeJson(
        contentPaths.manifest(manifest.folder),
        manifest,
        expectedEtag,
      );
      await this.syncCatalogs(manifest);
      return { manifest, etag: stored.etag };
    } catch (error) {
      this.rethrowStorageError(error);
    }
  }

  async purge(id: string): Promise<void> {
    const current = await this.requireManifest(id);
    if (current.manifest.localizations.es?.status !== "trashed") {
      this.invalid("Sólo se pueden purgar documentos en la papelera.");
    }
    const blobs = await this.listAll(`${current.manifest.folder}/`);
    if (blobs.length) await del(blobs.map((blob) => blob.url));
    await del(contentPaths.duplicateKey(current.manifest.canonicalKey)).catch(
      () => undefined,
    );
    await this.rebuildAllCatalogs();
  }

  async cleanupVersions(
    id: string,
    expectedEtag: string,
  ): Promise<DocumentCleanupResult> {
    const current = await this.requireManifest(id);
    if (current.etag !== expectedEtag) this.throwConflict();
    const active = Object.values(current.manifest.localizations).filter(
      (localization): localization is DocumentLocalization =>
        Boolean(localization),
    );
    if (!active.some((item) => item.status === "published")) {
      this.invalid("Sólo se pueden limpiar versiones publicadas.");
    }
    const remaining = cleanupRemainingMinutes(current.manifest.updatedAt);
    if (remaining > 0) {
      this.invalid(`Debes esperar ${remaining} minutos antes de limpiar.`);
    }
    const blobs = await this.listAll(`${current.manifest.folder}/`);
    const activePaths = new Set(active.map((item) => item.content.pathname));
    const contentBlobs = blobs
      .filter((blob) =>
        /\/(?:es|en)\/document-[^/]+\.(?:md|html)$/.test(blob.pathname),
      )
      .sort(
        (left, right) => right.uploadedAt.getTime() - left.uploadedAt.getTime(),
      );
    for (const locale of ["es", "en"] as const) {
      const previous = contentBlobs.find(
        (blob) =>
          blob.pathname.includes(`/${locale}/`) &&
          !activePaths.has(blob.pathname),
      );
      if (previous) activePaths.add(previous.pathname);
    }
    const candidates = blobs.filter(
      (blob) =>
        /\/(?:es|en)\/document-[^/]+\.(?:md|html)$/.test(blob.pathname) &&
        !activePaths.has(blob.pathname) &&
        blob.uploadedAt.getTime() <=
          new Date(current.manifest.updatedAt).getTime(),
    );
    if (candidates.length) await del(candidates.map((blob) => blob.url));
    return {
      deletedFiles: candidates.length,
      deletedBytes: candidates.reduce((sum, blob) => sum + blob.size, 0),
      retainedFiles: contentBlobs.length - candidates.length,
    };
  }

  async getPublicCatalog(locale: ContentLocale = "es"): Promise<PublicCatalog> {
    const prefix = contentPaths.catalogs(locale);
    const versions = await this.listAll(prefix);
    const latest = versions
      .filter((blob) => blob.pathname.endsWith(".json"))
      .sort(
        (a, b) =>
          b.uploadedAt.getTime() - a.uploadedAt.getTime() ||
          b.pathname.localeCompare(a.pathname),
      )[0];
    if (latest) {
      const stored = await this.readJson<unknown>(latest.pathname, {
        pathname: latest.pathname,
        url: latest.url,
        etag: latest.etag,
      });
      if (stored) return normalizePublicCatalog(stored.value, locale);
    }
    return this.rebuildPublicCatalog(locale);
  }

  async rebuildPublicCatalog(
    locale: ContentLocale = "es",
  ): Promise<PublicCatalog> {
    const manifests = await this.listManifests();
    const documents = manifests
      .map(({ manifest }) => toCatalogEntry(manifest, locale))
      .filter((entry): entry is CatalogEntry => Boolean(entry))
      .sort(compareCatalogEntries);
    const catalog: PublicCatalog = {
      schemaVersion: 3,
      locale,
      generatedAt: new Date().toISOString(),
      documents,
    };
    await this.writeJson(
      contentPaths.catalogVersion(locale, `${Date.now()}-${createShortId()}`),
      catalog,
      undefined,
      false,
      31_536_000,
    );
    return catalog;
  }

  async get(): Promise<VersionedTaxonomy> {
    this.assertConfigured();
    const current = await this.readJson<unknown>(contentPaths.taxonomyV2);
    if (current) {
      return { taxonomy: normalizeTaxonomy(current.value), etag: current.etag };
    }
    const legacy = await this.readJson<unknown>(contentPaths.taxonomy);
    return legacy
      ? { taxonomy: normalizeTaxonomy(legacy.value), etag: null }
      : { taxonomy: emptyTaxonomy(), etag: null };
  }

  async save(
    taxonomy: Taxonomy,
    expectedEtag: string | null,
  ): Promise<VersionedTaxonomy> {
    const current = await this.readJson<unknown>(contentPaths.taxonomyV2);
    if ((current?.etag ?? null) !== expectedEtag) this.throwConflict();
    try {
      await this.writeTaxonomyLocaleVersions(taxonomy);
      const stored = await this.writeJson(
        contentPaths.taxonomyV2,
        taxonomy,
        expectedEtag ?? undefined,
        expectedEtag === null,
      );
      await this.rebuildAllCatalogs();
      return { taxonomy, etag: stored.etag };
    } catch (error) {
      this.rethrowStorageError(error);
    }
  }

  async migrate(mode: MigrationMode): Promise<MigrationResult> {
    const blobs = await this.listAll(contentPaths.documents);
    const manifests = blobs.filter((blob) =>
      blob.pathname.endsWith("/manifest.json"),
    );
    const result: MigrationResult = {
      mode,
      inspected: manifests.length,
      migrated: 0,
      alreadyMigrated: 0,
      taxonomy: "unchanged",
      errors: [],
    };
    for (const blob of manifests) {
      try {
        const stored = await this.readJson<Record<string, unknown>>(
          blob.pathname,
        );
        if (!stored) continue;
        if (stored.value.schemaVersion === 3) {
          if (mode === "verify") {
            const manifest = normalizeDocumentManifest(stored.value);
            for (const localization of Object.values(manifest.localizations)) {
              if (
                localization &&
                !(await this.locateBlob(localization.content.pathname))
              ) {
                throw new Error(
                  `Falta el contenido ${localization.content.pathname}.`,
                );
              }
            }
            if (
              !(await this.locateBlob(
                contentPaths.duplicateKey(manifest.canonicalKey),
              ))
            ) {
              throw new Error("Falta el marcador de duplicado.");
            }
          }
          result.alreadyMigrated += 1;
          continue;
        }
        if (mode === "verify") {
          throw new Error("El manifiesto todavía requiere migración.");
        }
        const manifest = normalizeDocumentManifest(stored.value);
        const spanish = manifest.localizations.es;
        if (!spanish) continue;
        if (mode === "apply") {
          const source = await this.readText(spanish.content.pathname);
          if (!source) throw new Error("Contenido español inexistente.");
          const content = await this.writeContent(
            manifest.folder,
            "es",
            spanish.content.kind,
            source.value,
          );
          const migrated = withManifestProjection({
            ...manifest,
            localizations: {
              ...manifest.localizations,
              es: { ...spanish, content },
            },
          });
          await this.writeJson(blob.pathname, migrated, stored.etag);
          if (
            !(await this.locateBlob(
              contentPaths.duplicateKey(manifest.canonicalKey),
            ))
          ) {
            await this.writeJson(
              contentPaths.duplicateKey(manifest.canonicalKey),
              {
                documentId: manifest.id,
                canonicalKey: manifest.canonicalKey,
                folder: manifest.folder,
              },
            );
          }
        }
        result.migrated += 1;
      } catch (error) {
        result.errors.push(
          `${blob.pathname}: ${error instanceof Error ? error.message : "error"}`,
        );
      }
    }
    const currentTaxonomy = await this.readJson<unknown>(
      contentPaths.taxonomyV2,
    );
    const legacyTaxonomy = currentTaxonomy
      ? null
      : await this.readJson<unknown>(contentPaths.taxonomy);
    if (currentTaxonomy) {
      if (mode === "verify") {
        const taxonomy = normalizeTaxonomy(currentTaxonomy.value);
        for (const locale of ["es", "en"] as const) {
          if (
            locale === "en" &&
            !taxonomy.categories.some((category) => category.localizations.en)
          ) {
            continue;
          }
          const versions = await this.listAll(
            `${contentPaths.root}/system/taxonomy/${locale}/taxonomy-`,
          );
          if (!versions.length) {
            result.errors.push(
              `Taxonomía: falta el snapshot localizado ${locale.toUpperCase()}.`,
            );
          }
        }
        result.taxonomy = "verified";
      }
    } else if (legacyTaxonomy) {
      result.taxonomy = "pending";
      if (mode === "apply") {
        const taxonomy = normalizeTaxonomy(legacyTaxonomy.value);
        await this.writeTaxonomyLocaleVersions(taxonomy);
        await this.writeJson(contentPaths.taxonomyV2, taxonomy);
        result.taxonomy = "migrated";
      } else if (mode === "verify") {
        result.errors.push("Taxonomía: todavía requiere migración a v2.");
      }
    }
    if (mode === "apply") await this.rebuildAllCatalogs();
    return result;
  }

  private async writeTaxonomyLocaleVersions(taxonomy: Taxonomy) {
    const generationId = `${Date.now()}-${createShortId()}`;
    await Promise.all(
      (["es", "en"] as const).map(async (locale) => {
        const categories = taxonomy.categories
          .map((category) => {
            const label = category.localizations[locale];
            if (!label) return null;
            return {
              id: category.id,
              ...label,
              subcategories: category.subcategories
                .map((subcategory) => {
                  const subcategoryLabel = subcategory.localizations[locale];
                  return subcategoryLabel
                    ? { id: subcategory.id, ...subcategoryLabel }
                    : null;
                })
                .filter(
                  (
                    subcategory,
                  ): subcategory is {
                    id: string;
                    name: string;
                    slug: string;
                  } => Boolean(subcategory),
                ),
            };
          })
          .filter(
            (
              category,
            ): category is {
              id: string;
              name: string;
              slug: string;
              subcategories: {
                id: string;
                name: string;
                slug: string;
              }[];
            } => Boolean(category),
          );
        if (locale === "en" && !categories.length) return;
        await this.writeJson(
          contentPaths.taxonomyLocaleVersion(locale, generationId),
          {
            schemaVersion: 2,
            locale,
            updatedAt: taxonomy.updatedAt,
            categories,
          },
          undefined,
          false,
          31_536_000,
        );
      }),
    );
  }

  private async rebuildAllCatalogs() {
    await Promise.all([
      this.rebuildPublicCatalog("es"),
      this.rebuildPublicCatalog("en"),
    ]);
  }

  private async syncCatalogs(manifest: DocumentManifest) {
    const current = await this.listManifests();
    const manifests = [
      { manifest, etag: "" },
      ...current.filter((item) => item.manifest.id !== manifest.id),
    ];
    for (const locale of ["es", "en"] as const) {
      const catalog: PublicCatalog = {
        schemaVersion: 3,
        locale,
        generatedAt: new Date().toISOString(),
        documents: manifests
          .map((item) => toCatalogEntry(item.manifest, locale))
          .filter((entry): entry is CatalogEntry => Boolean(entry))
          .sort(compareCatalogEntries),
      };
      await this.writeJson(
        contentPaths.catalogVersion(locale, `${Date.now()}-${createShortId()}`),
        catalog,
        undefined,
        false,
        31_536_000,
      );
    }
  }

  private async writeContent(
    folder: string,
    locale: ContentLocale,
    kind: "markdown" | "html",
    source: string,
  ): Promise<DocumentContent> {
    const pathname = contentPaths.content(
      folder,
      locale,
      createShortId(),
      kind,
    );
    const blob = await put(pathname, source, {
      access: "public",
      contentType:
        kind === "html"
          ? "text/html; charset=utf-8"
          : "text/markdown; charset=utf-8",
      cacheControlMaxAge: 60,
    });
    return {
      kind,
      pathname,
      url: blob.url,
      assetBaseUrl: new URL(`/${folder}/`, blob.url).href,
    };
  }

  private async findManifestById(
    id: string,
  ): Promise<VersionedManifest | null> {
    const manifests = await this.listManifests();
    return manifests.find(({ manifest }) => manifest.id === id) ?? null;
  }

  private async requireManifest(id: string): Promise<VersionedManifest> {
    const manifest = await this.findManifestById(id);
    if (!manifest) {
      throw new ContentManagementError("NOT_FOUND", "Documento no encontrado.");
    }
    return manifest;
  }

  private async withContent(
    manifest: DocumentManifest,
    etag: string,
  ): Promise<VersionedDocument> {
    const sources: VersionedDocument["sources"] = {};
    for (const locale of ["es", "en"] as const) {
      const localization = manifest.localizations[locale];
      if (!localization) continue;
      const stored = await this.readText(localization.content.pathname);
      if (!stored) this.storageFailure("leer un contenido del manifiesto");
      sources[locale] = stored.value;
    }
    return { manifest, etag, sources, source: sources.es ?? "" };
  }

  private async listManifests(): Promise<VersionedManifest[]> {
    this.assertConfigured();
    const blobs = await this.listAll(contentPaths.documents);
    const stored = await Promise.all(
      blobs
        .filter((blob) => blob.pathname.endsWith("/manifest.json"))
        .map((blob) => this.readJson<unknown>(blob.pathname)),
    );
    return stored
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => ({
        manifest: normalizeDocumentManifest(item.value),
        etag: item.etag,
      }));
  }

  private assertUniqueSlug(
    manifests: VersionedManifest[],
    locale: ContentLocale,
    slug: string,
    exceptId?: string,
  ) {
    if (
      manifests.some(
        ({ manifest }) =>
          manifest.id !== exceptId &&
          manifest.localizations[locale]?.slug === slug,
      )
    ) {
      this.invalid(`El slug “${slug}” ya existe en ${locale.toUpperCase()}.`);
    }
  }

  private assertTranslatedTaxonomy(
    taxonomy: Taxonomy,
    categoryId: string | null,
    subcategoryId: string | null,
    locale: ContentLocale,
  ) {
    if (locale === "es" || !categoryId) return;
    const category = taxonomy.categories.find((item) => item.id === categoryId);
    if (!category?.localizations[locale]) {
      this.invalid("La categoría no tiene traducción al inglés.");
    }
    if (
      subcategoryId &&
      !category.subcategories.find((item) => item.id === subcategoryId)
        ?.localizations[locale]
    ) {
      this.invalid("La subcategoría no tiene traducción al inglés.");
    }
  }

  private async listAll(prefix: string) {
    const blobs: Awaited<ReturnType<typeof list>>["blobs"] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      blobs.push(...page.blobs);
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return blobs;
  }

  private async readText(pathname: string, located?: LocatedBlob) {
    const blob = located ?? (await this.locateBlob(pathname));
    if (!blob) return null;
    const response = await fetch(versionedBlobUrl(blob.url, blob.etag), {
      cache: "no-store",
    });
    if (response.status === 404) return null;
    if (!response.ok) this.storageFailure(`leer ${pathname}`);
    return {
      value: await response.text(),
      etag: normalizeBlobEtag(blob.etag),
    };
  }

  private async readJson<T>(pathname: string, located?: LocatedBlob) {
    const stored = await this.readText(pathname, located);
    return stored
      ? { value: JSON.parse(stored.value) as T, etag: stored.etag }
      : null;
  }

  private async locateBlob(pathname: string): Promise<LocatedBlob | null> {
    try {
      const blob = await head(pathname);
      return { pathname: blob.pathname, url: blob.url, etag: blob.etag };
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
  }

  private async writeJson(
    pathname: string,
    value: unknown,
    ifMatch?: string,
    allowOverwrite = false,
    cacheControlMaxAge = 60,
  ) {
    const stored = await put(pathname, JSON.stringify(value), {
      access: "public",
      contentType: "application/json; charset=utf-8",
      cacheControlMaxAge,
      ifMatch: ifMatch ? normalizeBlobEtag(ifMatch) : undefined,
      allowOverwrite: allowOverwrite || Boolean(ifMatch),
    });
    return { ...stored, etag: normalizeBlobEtag(stored.etag) };
  }

  private assertConfigured() {
    if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
      throw new ContentManagementError(
        "NOT_CONFIGURED",
        "Vercel Blob todavía no está conectado al proyecto.",
      );
    }
  }

  private invalid(message: string): never {
    throw new ContentManagementError("INVALID_INPUT", message);
  }

  private throwConflict(): never {
    throw new ContentManagementError(
      "CONFLICT",
      "El contenido cambió en otra sesión. Recarga antes de guardar.",
    );
  }

  private storageFailure(action: string): never {
    throw new ContentManagementError(
      "STORAGE_FAILURE",
      `Vercel Blob no pudo ${action}.`,
    );
  }

  private rethrowStorageError(error: unknown): never {
    if (error instanceof BlobPreconditionFailedError) this.throwConflict();
    if (error instanceof ContentManagementError) throw error;
    throw new ContentManagementError(
      "STORAGE_FAILURE",
      "Vercel Blob no pudo completar la operación.",
      { cause: error },
    );
  }
}

function toCatalogEntry(
  manifest: DocumentManifest,
  locale: ContentLocale,
): CatalogEntry | null {
  const localization = manifest.localizations[locale];
  if (!localization || localization.status !== "published") return null;
  const alternateSlugs: CatalogEntry["alternateSlugs"] = {};
  for (const candidate of ["es", "en"] as const) {
    const alternate = manifest.localizations[candidate];
    if (alternate?.status === "published") {
      alternateSlugs[candidate] = alternate.slug;
    }
  }
  return {
    id: manifest.id,
    locale,
    slug: localization.slug,
    alternateSlugs,
    folder: manifest.folder,
    metadata: { ...localization.metadata, order: manifest.order },
    categoryId: manifest.categoryId,
    subcategoryId: manifest.subcategoryId,
    content: localization.content,
    updatedAt: localization.updatedAt,
    publishedAt: localization.publishedAt!,
  };
}

function compareCatalogEntries(left: CatalogEntry, right: CatalogEntry) {
  return (
    (left.metadata.order ?? 0) - (right.metadata.order ?? 0) ||
    left.metadata.title.localeCompare(right.metadata.title)
  );
}

function emptyTaxonomy(): Taxonomy {
  return {
    schemaVersion: 2,
    categories: [],
    updatedAt: new Date(0).toISOString(),
  };
}

function assertTransition(from: DocumentStatus, to: DocumentStatus) {
  const allowed: Record<DocumentStatus, DocumentStatus[]> = {
    draft: ["published", "trashed"],
    published: ["draft", "trashed"],
    trashed: ["draft"],
  };
  if (!allowed[from].includes(to)) {
    throw new ContentManagementError(
      "INVALID_INPUT",
      `No se puede cambiar el estado de ${from} a ${to}.`,
    );
  }
}
