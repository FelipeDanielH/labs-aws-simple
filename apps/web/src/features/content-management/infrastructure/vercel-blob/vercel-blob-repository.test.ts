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
