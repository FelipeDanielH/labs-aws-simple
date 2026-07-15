import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentManifest } from "../../domain/models";

const blobMocks = vi.hoisted(() => ({
  del: vi.fn(),
  head: vi.fn(),
  list: vi.fn(),
  put: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@vercel/blob", () => ({
  BlobNotFoundError: class BlobNotFoundError extends Error {},
  BlobPreconditionFailedError: class BlobPreconditionFailedError extends Error {},
  ...blobMocks,
}));

import { VercelBlobContentRepository } from "./vercel-blob-repository";

const manifestPath = "aws-labs/v1/documents/laboratorio-abc123/manifest.json";
const markdownPath =
  "aws-labs/v1/documents/laboratorio-abc123/document-current.md";

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
    expect(document?.markdown).toBe("# Markdown vigente");
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
      String(pathname).startsWith("aws-labs/v1/system/public-catalog-"),
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

  it("conserva la generación Markdown anterior hasta la purga", async () => {
    const repository = new VercelBlobContentRepository();

    await repository.update("document-1", {
      markdown: "# Segunda generación",
      metadata: createManifest().metadata,
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
    };
    const previousPath =
      "aws-labs/v1/documents/laboratorio-abc123/document-previous.md";
    const oldPath = "aws-labs/v1/documents/laboratorio-abc123/document-old.md";
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
});

function createManifest(): DocumentManifest {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: "document-1",
    slug: "laboratorio",
    folder: "aws-labs/v1/documents/laboratorio-abc123",
    originalFileName: "laboratorio.docx",
    status: "draft",
    metadata: {
      title: "Título vigente",
      summary: "",
      author: "",
      tags: [],
      order: null,
      extra: {},
    },
    categoryId: null,
    subcategoryId: null,
    markdownPathname: markdownPath,
    markdownUrl: `https://store.public.blob.vercel-storage.com/${markdownPath}`,
    assets: [],
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    deletedAt: null,
  };
}
