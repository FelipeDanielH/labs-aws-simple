import "server-only";

import { BlobPreconditionFailedError, del, get, list, put } from "@vercel/blob";

import type { DocumentRepository } from "../../application/ports/document-repository";
import type { TaxonomyRepository } from "../../application/ports/taxonomy-repository";
import { contentPaths, createShortId } from "../../application/document-paths";
import { ContentManagementError } from "../../domain/errors";
import type {
  CatalogEntry,
  CreateDocumentInput,
  DocumentManifest,
  DocumentStatus,
  PublicCatalog,
  Taxonomy,
  UpdateDocumentInput,
  VersionedDocument,
  VersionedTaxonomy,
} from "../../domain/models";
import { normalizeBlobEtag } from "./blob-etag";

const PUBLIC_OPTIONS = { access: "public" as const, useCache: false };

export class VercelBlobContentRepository
  implements DocumentRepository, TaxonomyRepository
{
  async list(status?: DocumentStatus): Promise<DocumentManifest[]> {
    this.assertConfigured();
    const manifests = await this.listManifests();
    return manifests
      .map((item) => item.manifest)
      .filter((manifest) => !status || manifest.status === status)
      .sort(compareDocuments);
  }

  async findById(id: string): Promise<VersionedDocument | null> {
    const manifests = await this.listManifests();
    const match = manifests.find((item) => item.manifest.id === id);
    return match ? this.withMarkdown(match.manifest, match.etag) : null;
  }

  async findPublishedBySlug(slug: string): Promise<VersionedDocument | null> {
    const manifests = await this.listManifests();
    const match = manifests.find(
      (item) =>
        item.manifest.slug === slug && item.manifest.status === "published",
    );
    return match ? this.withMarkdown(match.manifest, match.etag) : null;
  }

  async create(input: CreateDocumentInput): Promise<VersionedDocument> {
    this.assertConfigured();
    const now = new Date().toISOString();
    const markdownPathname = contentPaths.markdown(
      input.folder,
      createShortId(),
    );
    const markdownBlob = await put(markdownPathname, input.markdown, {
      access: "public",
      contentType: "text/markdown; charset=utf-8",
      cacheControlMaxAge: 60,
    });

    const manifest: DocumentManifest = {
      schemaVersion: 1,
      id: input.id,
      slug: input.slug,
      folder: input.folder,
      originalFileName: input.originalFileName,
      status: "draft",
      metadata: input.metadata,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      markdownPathname,
      markdownUrl: markdownBlob.url,
      assets: input.assets.map((asset) => ({ ...asset, id: createShortId() })),
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      deletedAt: null,
    };

    try {
      const stored = await this.writeJson(
        contentPaths.manifest(input.folder),
        manifest,
      );
      return { manifest, etag: stored.etag, markdown: input.markdown };
    } catch (error) {
      await del(markdownBlob.url).catch(() => undefined);
      throw error;
    }
  }

  async update(
    id: string,
    input: UpdateDocumentInput,
  ): Promise<VersionedDocument> {
    const current = await this.requireDocument(id);
    if (current.etag !== input.expectedEtag) this.throwConflict();

    const markdownPathname = contentPaths.markdown(
      current.manifest.folder,
      createShortId(),
    );
    const markdownBlob = await put(markdownPathname, input.markdown, {
      access: "public",
      contentType: "text/markdown; charset=utf-8",
      cacheControlMaxAge: 60,
    });
    const manifest: DocumentManifest = {
      ...current.manifest,
      metadata: input.metadata,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      markdownPathname,
      markdownUrl: markdownBlob.url,
      updatedAt: new Date().toISOString(),
    };

    try {
      const stored = await this.writeJson(
        contentPaths.manifest(manifest.folder),
        manifest,
        input.expectedEtag,
      );
      await del(current.manifest.markdownPathname).catch(() => undefined);
      if (manifest.status === "published") await this.rebuildPublicCatalog();
      return { manifest, etag: stored.etag, markdown: input.markdown };
    } catch (error) {
      await del(markdownBlob.url).catch(() => undefined);
      this.rethrowStorageError(error);
    }
  }

  async transition(
    id: string,
    status: DocumentStatus,
    expectedEtag: string,
  ): Promise<VersionedDocument> {
    const current = await this.requireDocument(id);
    if (current.etag !== expectedEtag) this.throwConflict();
    assertTransition(current.manifest.status, status);
    const now = new Date().toISOString();
    const manifest: DocumentManifest = {
      ...current.manifest,
      status,
      updatedAt: now,
      publishedAt:
        status === "published"
          ? (current.manifest.publishedAt ?? now)
          : current.manifest.publishedAt,
      deletedAt: status === "trashed" ? now : null,
    };
    try {
      const stored = await this.writeJson(
        contentPaths.manifest(manifest.folder),
        manifest,
        expectedEtag,
      );
      await this.rebuildPublicCatalog();
      return { ...current, manifest, etag: stored.etag };
    } catch (error) {
      this.rethrowStorageError(error);
    }
  }

  async purge(id: string): Promise<void> {
    const current = await this.requireDocument(id);
    if (current.manifest.status !== "trashed") {
      throw new ContentManagementError(
        "INVALID_INPUT",
        "Sólo se pueden purgar documentos que están en la papelera.",
      );
    }
    const blobs = await this.listAll(current.manifest.folder + "/");
    if (blobs.length) await del(blobs.map((blob) => blob.url));
    await this.rebuildPublicCatalog();
  }

  async getPublicCatalog(): Promise<PublicCatalog> {
    this.assertConfigured();
    const stored = await this.readJson<PublicCatalog>(contentPaths.catalog);
    return stored?.value ?? emptyCatalog();
  }

  async rebuildPublicCatalog(): Promise<PublicCatalog> {
    const manifests = await this.listManifests();
    const documents = manifests
      .map((item) => item.manifest)
      .filter((manifest) => manifest.status === "published")
      .map(toCatalogEntry)
      .sort((left, right) => {
        const order = (left.metadata.order ?? 0) - (right.metadata.order ?? 0);
        return order || left.metadata.title.localeCompare(right.metadata.title);
      });
    const catalog: PublicCatalog = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      documents,
    };
    await this.writeJson(contentPaths.catalog, catalog, undefined, true);
    return catalog;
  }

  async get(): Promise<VersionedTaxonomy> {
    this.assertConfigured();
    const stored = await this.readJson<Taxonomy>(contentPaths.taxonomy);
    return stored
      ? { taxonomy: stored.value, etag: stored.etag }
      : { taxonomy: emptyTaxonomy(), etag: null };
  }

  async save(
    taxonomy: Taxonomy,
    expectedEtag: string | null,
  ): Promise<VersionedTaxonomy> {
    const current = await this.readJson<Taxonomy>(contentPaths.taxonomy);
    if ((current?.etag ?? null) !== expectedEtag) this.throwConflict();
    try {
      const stored = await this.writeJson(
        contentPaths.taxonomy,
        taxonomy,
        expectedEtag ?? undefined,
        expectedEtag === null,
      );
      return { taxonomy, etag: stored.etag };
    } catch (error) {
      this.rethrowStorageError(error);
    }
  }

  private async requireDocument(id: string): Promise<VersionedDocument> {
    const document = await this.findById(id);
    if (!document) {
      throw new ContentManagementError("NOT_FOUND", "Documento no encontrado.");
    }
    return document;
  }

  private async withMarkdown(
    manifest: DocumentManifest,
    etag: string,
  ): Promise<VersionedDocument> {
    const stored = await this.readText(manifest.markdownPathname);
    if (!stored) {
      throw new ContentManagementError(
        "STORAGE_FAILURE",
        "El manifiesto apunta a un Markdown inexistente.",
      );
    }
    return { manifest, etag, markdown: stored.value };
  }

  private async listManifests(): Promise<
    Array<{ manifest: DocumentManifest; etag: string }>
  > {
    this.assertConfigured();
    const blobs = await this.listAll(contentPaths.documents);
    const manifestBlobs = blobs.filter((blob) =>
      blob.pathname.endsWith("/manifest.json"),
    );
    const results = await Promise.all(
      manifestBlobs.map((blob) =>
        this.readJson<DocumentManifest>(blob.pathname),
      ),
    );
    return results
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .map((item) => ({ manifest: item.value, etag: item.etag }));
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

  private async readText(pathname: string) {
    const result = await get(pathname, PUBLIC_OPTIONS);
    if (!result || result.statusCode !== 200) return null;
    return {
      value: await new Response(result.stream).text(),
      etag: normalizeBlobEtag(result.blob.etag),
    };
  }

  private async readJson<T>(pathname: string) {
    const stored = await this.readText(pathname);
    return stored
      ? { value: JSON.parse(stored.value) as T, etag: stored.etag }
      : null;
  }

  private async writeJson(
    pathname: string,
    value: unknown,
    ifMatch?: string,
    allowOverwrite = false,
  ) {
    const stored = await put(pathname, JSON.stringify(value), {
      access: "public",
      contentType: "application/json; charset=utf-8",
      cacheControlMaxAge: 60,
      ifMatch: ifMatch ? normalizeBlobEtag(ifMatch) : undefined,
      allowOverwrite: allowOverwrite || Boolean(ifMatch),
    });
    return { ...stored, etag: normalizeBlobEtag(stored.etag) };
  }

  private assertConfigured(): void {
    // @vercel/blob resolves Vercel's short-lived OIDC credential
    // asynchronously. BLOB_STORE_ID is therefore sufficient to identify a
    // connected store; requiring VERCEL_OIDC_TOKEN here would reject valid
    // deployments before the SDK can obtain the token.
    if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
      throw new ContentManagementError(
        "NOT_CONFIGURED",
        "Vercel Blob todavía no está conectado al proyecto.",
      );
    }
  }

  private throwConflict(): never {
    throw new ContentManagementError(
      "CONFLICT",
      "El contenido cambió en otra sesión. Recarga antes de guardar.",
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

function toCatalogEntry(manifest: DocumentManifest): CatalogEntry {
  return {
    id: manifest.id,
    slug: manifest.slug,
    folder: manifest.folder,
    metadata: manifest.metadata,
    categoryId: manifest.categoryId,
    subcategoryId: manifest.subcategoryId,
    markdownUrl: manifest.markdownUrl,
    updatedAt: manifest.updatedAt,
    publishedAt: manifest.publishedAt,
  };
}

function emptyCatalog(): PublicCatalog {
  return {
    schemaVersion: 1,
    generatedAt: new Date(0).toISOString(),
    documents: [],
  };
}

function emptyTaxonomy(): Taxonomy {
  return {
    schemaVersion: 1,
    categories: [],
    updatedAt: new Date(0).toISOString(),
  };
}

function compareDocuments(left: DocumentManifest, right: DocumentManifest) {
  return right.updatedAt.localeCompare(left.updatedAt);
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
