import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentManifest } from "../../domain/models";

const blobMocks = vi.hoisted(() => ({
  BlobNotFoundError: class BlobNotFoundError extends Error {},
  BlobPreconditionFailedError: class BlobPreconditionFailedError extends Error {},
  del: vi.fn(),
  head: vi.fn(),
  list: vi.fn(),
  put: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@vercel/blob", () => ({
  ...blobMocks,
}));

import { VercelBlobContentRepository } from "./vercel-blob-repository";

const manifestPath = "aws-labs/v1/documents/laboratorio-abc123/manifest.json";
const markdownPath =
  "aws-labs/v1/documents/laboratorio-abc123/es/document-current.md";

describe("VercelBlobContentRepository", () => {
  beforeEach(() => {
    process.env.BLOB_STORE_ID = "store_test";
    blobMocks.list.mockResolvedValue({
      blobs: [
        {
          pathname: manifestPath,
          url: `https://store.public.blob.vercel-storage.com/${manifestPath}`,
          etag: "stale-manifest-etag",
        },
      ],
      cursor: undefined,
      hasMore: false,
    });
    blobMocks.head.mockImplementation(async (pathname: string) => ({
      pathname,
      url: `https://store.public.blob.vercel-storage.com/${pathname}`,
      etag:
        pathname === manifestPath
          ? "current-manifest-etag"
          : "current-markdown-etag",
    }));
    blobMocks.put.mockResolvedValue({
      pathname: manifestPath,
      url: `https://store.public.blob.vercel-storage.com/${manifestPath}`,
      etag: "updated-manifest-etag",
    });

    const manifest = createManifest();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        return new Response(
          url.includes("manifest.json")
            ? JSON.stringify(manifest)
            : "# Markdown vigente",
          { status: 200 },
        );
      }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    delete process.env.BLOB_STORE_ID;
  });

  it("usa head para leer la versión vigente aunque list entregue metadata antigua", async () => {
    const repository = new VercelBlobContentRepository();

    const document = await repository.findById("document-1");

    expect(document?.manifest.metadata.title).toBe("Título vigente");
    expect(document?.source).toBe("# Markdown vigente");
    expect(blobMocks.head).toHaveBeenCalledWith(manifestPath);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("manifest.json?v=current-manifest-etag"),
      { cache: "no-store" },
    );
  });

  it("cambia el estado usando sólo el manifiesto, sin descargar Markdown", async () => {
    const repository = new VercelBlobContentRepository();

    const document = await repository.transition(
      "document-1",
      "trashed",
      "current-manifest-etag",
    );

    expect(document.manifest.status).toBe("trashed");
    expect(blobMocks.head).not.toHaveBeenCalledWith(markdownPath);
  });

  it("proyecta una publicación confirmada sin releer su estado desde la CDN", async () => {
    const repository = new VercelBlobContentRepository();

    await repository.transition(
      "document-1",
      "published",
      "current-manifest-etag",
    );

    const catalogWrites = blobMocks.put.mock.calls.filter(([pathname]) =>
      String(pathname).startsWith(
        "aws-labs/v1/system/catalog/es/public-catalog-",
      ),
    );
    const latestCatalog = JSON.parse(String(catalogWrites.at(-1)?.[1])) as {
      documents: Array<{ id: string }>;
    };

    expect(latestCatalog.documents).toEqual([
      expect.objectContaining({ id: "document-1" }),
    ]);
    expect(catalogWrites.at(-1)?.[2]).toEqual(
      expect.objectContaining({
        allowOverwrite: false,
        cacheControlMaxAge: 31_536_000,
      }),
    );
  });

  it("impide publicar inglés antes de publicar español", async () => {
    const manifest = createManifest();
    manifest.localizations.en = {
      ...manifest.localizations.es!,
      locale: "en",
      slug: "laboratory",
      originalFileName: "laboratory.md",
      content: {
        ...manifest.content,
        pathname:
          "aws-labs/v1/documents/laboratorio-abc123/en/document-current.md",
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (input: string | URL | Request) =>
          new Response(
            String(input).includes("manifest.json")
              ? JSON.stringify(manifest)
              : "# Markdown",
            { status: 200 },
          ),
      ),
    );
    const repository = new VercelBlobContentRepository();

    await expect(
      repository.transition(
        "document-1",
        "published",
        "current-manifest-etag",
        "en",
      ),
    ).rejects.toThrow("Publica primero la versión en español");
  });

  it("impide despublicar español mientras inglés siga publicado", async () => {
    const manifest = createManifest();
    manifest.localizations.es = {
      ...manifest.localizations.es!,
      status: "published",
    };
    manifest.status = "published";
    manifest.localizations.en = {
      ...manifest.localizations.es,
      locale: "en",
      slug: "laboratory",
      originalFileName: "laboratory.md",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (input: string | URL | Request) =>
          new Response(
            String(input).includes("manifest.json")
              ? JSON.stringify(manifest)
              : "# Markdown",
            { status: 200 },
          ),
      ),
    );
    const repository = new VercelBlobContentRepository();

    await expect(
      repository.transition(
        "document-1",
        "draft",
        "current-manifest-etag",
        "es",
      ),
    ).rejects.toThrow(
      "Despublica los demás idiomas antes de despublicar español",
    );
  });

  it("conserva la generación Markdown anterior hasta la purga", async () => {
    const repository = new VercelBlobContentRepository();

    await repository.update("document-1", {
      locale: "es",
      source: "# Segunda generación",
      metadata: createManifest().localizations.es!.metadata,
      order: null,
      categoryId: null,
      subcategoryId: null,
      expectedEtag: "current-manifest-etag",
    });

    expect(blobMocks.del).not.toHaveBeenCalledWith(markdownPath);
  });

  it("limpia versiones antiguas después de diez minutos y conserva dos", async () => {
    const updatedAt = new Date(Date.now() - 11 * 60 * 1000);
    const manifest = {
      ...createManifest(),
      status: "published" as const,
      updatedAt: updatedAt.toISOString(),
      localizations: {
        es: {
          ...createManifest().localizations.es!,
          status: "published" as const,
          updatedAt: updatedAt.toISOString(),
        },
      },
    };
    const previousPath =
      "aws-labs/v1/documents/laboratorio-abc123/es/document-previous.md";
    const oldPath =
      "aws-labs/v1/documents/laboratorio-abc123/es/document-old.md";
    const blob = (pathname: string, uploadedAt: Date, size: number) => ({
      pathname,
      url: `https://store.public.blob.vercel-storage.com/${pathname}`,
      etag: `${pathname}-etag`,
      uploadedAt,
      size,
    });
    blobMocks.list.mockResolvedValue({
      blobs: [
        blob(manifestPath, updatedAt, 500),
        blob(markdownPath, updatedAt, 1_000),
        blob(previousPath, new Date(updatedAt.getTime() - 60_000), 900),
        blob(oldPath, new Date(updatedAt.getTime() - 120_000), 800),
      ],
      cursor: undefined,
      hasMore: false,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (input: string | URL | Request) =>
          new Response(
            String(input).includes("manifest.json")
              ? JSON.stringify(manifest)
              : "# Markdown",
            { status: 200 },
          ),
      ),
    );
    const repository = new VercelBlobContentRepository();

    const result = await repository.cleanupVersions(
      "document-1",
      "current-manifest-etag",
    );

    expect(result).toEqual({
      deletedFiles: 1,
      deletedBytes: 800,
      retainedFiles: 2,
    });
    expect(blobMocks.del).toHaveBeenCalledWith([
      `https://store.public.blob.vercel-storage.com/${oldPath}`,
    ]);
  });

  it("migra manifiestos heredados una sola vez y puede reanudarse", async () => {
    const legacyContentPath =
      "aws-labs/v1/documents/laboratorio-abc123/document-legacy.md";
    let storedManifest: Record<string, unknown> = {
      schemaVersion: 2,
      id: "document-1",
      slug: "laboratorio",
      folder: "aws-labs/v1/documents/laboratorio-abc123",
      originalFileName: "laboratorio.docx",
      status: "published",
      metadata: {
        title: "Laboratorio",
        summary: "",
        author: "",
        tags: [],
        order: null,
        extra: {},
      },
      categoryId: null,
      subcategoryId: null,
      content: {
        kind: "markdown",
        pathname: legacyContentPath,
        url: `https://store.public.blob.vercel-storage.com/${legacyContentPath}`,
        assetBaseUrl: null,
      },
      assets: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      publishedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
    };
    blobMocks.head.mockImplementation(async (pathname: string) => {
      if (
        pathname.includes("/system/taxonomy") ||
        (pathname.includes("/system/document-keys/") &&
          storedManifest.schemaVersion !== 3)
      ) {
        throw new blobMocks.BlobNotFoundError();
      }
      return {
        pathname,
        url: `https://store.public.blob.vercel-storage.com/${pathname}`,
        etag:
          pathname === manifestPath
            ? "current-manifest-etag"
            : "current-content-etag",
      };
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        return new Response(
          url.includes("manifest.json")
            ? JSON.stringify(storedManifest)
            : "# Markdown heredado",
          { status: 200 },
        );
      }),
    );
    blobMocks.put.mockImplementation(
      async (pathname: string, value: string) => {
        if (pathname === manifestPath) {
          storedManifest = JSON.parse(value) as Record<string, unknown>;
        }
        return {
          pathname,
          url: `https://store.public.blob.vercel-storage.com/${pathname}`,
          etag: "updated-etag",
        };
      },
    );
    const repository = new VercelBlobContentRepository();

    const first = await repository.migrate("apply");
    const localizedWritesAfterFirst = blobMocks.put.mock.calls.filter(
      ([pathname]) =>
        String(pathname).includes("/documents/laboratorio-abc123/es/document-"),
    ).length;
    const second = await repository.migrate("apply");
    const localizedWritesAfterSecond = blobMocks.put.mock.calls.filter(
      ([pathname]) =>
        String(pathname).includes("/documents/laboratorio-abc123/es/document-"),
    ).length;

    expect(first).toMatchObject({ migrated: 1, alreadyMigrated: 0 });
    expect(second).toMatchObject({ migrated: 0, alreadyMigrated: 1 });
    expect(localizedWritesAfterFirst).toBe(1);
    expect(localizedWritesAfterSecond).toBe(1);
    expect(storedManifest.schemaVersion).toBe(3);
  });
});

function createManifest(): DocumentManifest {
  const now = new Date().toISOString();
  const metadata = {
    title: "Título vigente",
    summary: "",
    author: "",
    tags: [],
    order: null,
    extra: {},
  };
  const content = {
    kind: "markdown" as const,
    pathname: markdownPath,
    url: `https://store.public.blob.vercel-storage.com/${markdownPath}`,
    assetBaseUrl: null,
  };
  return {
    schemaVersion: 3,
    id: "document-1",
    slug: "laboratorio",
    folder: "aws-labs/v1/documents/laboratorio-abc123",
    originalFileName: "laboratorio.docx",
    status: "draft",
    metadata,
    canonicalKey: "laboratorio",
    order: null,
    categoryId: null,
    subcategoryId: null,
    content,
    assets: [],
    localizations: {
      es: {
        locale: "es",
        slug: "laboratorio",
        originalFileName: "laboratorio.docx",
        status: "draft",
        metadata: {
          title: metadata.title,
          summary: metadata.summary,
          author: metadata.author,
          tags: metadata.tags,
          extra: metadata.extra,
        },
        content,
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
        deletedAt: null,
      },
    },
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    deletedAt: null,
  };
}
