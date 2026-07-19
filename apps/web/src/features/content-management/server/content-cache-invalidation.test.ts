import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentManifest } from "../domain/models";

const nextCacheMocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => nextCacheMocks);

import { invalidateManifestChange } from "./content-cache-invalidation";

describe("content cache invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("expira inmediatamente tags y ambas rutas al cambiar un slug publicado", () => {
    const previous = publishedManifest();
    const next = structuredClone(previous);
    next.localizations.es!.slug = "laboratorio-nuevo";
    next.slug = "laboratorio-nuevo";

    invalidateManifestChange(previous, next);

    expect(nextCacheMocks.revalidateTag.mock.calls).toEqual([
      ["aws-labs:document:document-1", { expire: 0 }],
      ["aws-labs:admin-documents", { expire: 0 }],
      ["aws-labs:catalog:es", { expire: 0 }],
    ]);
    expect(nextCacheMocks.revalidatePath).toHaveBeenCalledWith(
      "/es/laboratorios/laboratorio",
      "page",
    );
    expect(nextCacheMocks.revalidatePath).toHaveBeenCalledWith(
      "/es/laboratorios/laboratorio-nuevo",
      "page",
    );
  });

  it("invalida ES y EN al publicar la traducción bilingüe", () => {
    const previous = publishedManifest();
    previous.localizations.en = {
      ...previous.localizations.es!,
      locale: "en",
      slug: "laboratory",
      status: "draft",
      publishedAt: null,
    };
    const next = structuredClone(previous);
    next.localizations.en!.status = "published";
    next.localizations.en!.publishedAt = "2026-01-02T00:00:00.000Z";

    invalidateManifestChange(previous, next);

    expect(nextCacheMocks.revalidateTag).toHaveBeenCalledWith(
      "aws-labs:catalog:es",
      { expire: 0 },
    );
    expect(nextCacheMocks.revalidateTag).toHaveBeenCalledWith(
      "aws-labs:catalog:en",
      { expire: 0 },
    );
    expect(nextCacheMocks.revalidatePath).toHaveBeenCalledWith(
      "/en/laboratorios/laboratory",
      "page",
    );
  });
});

function publishedManifest(): DocumentManifest {
  const timestamp = "2026-01-01T00:00:00.000Z";
  const metadata = {
    title: "Laboratorio",
    summary: "",
    author: "",
    tags: [],
    order: null,
    extra: {},
  };
  const content = {
    kind: "markdown" as const,
    pathname: "aws-labs/v1/documents/laboratorio-abc123/es/document-current.md",
    url: "https://store.public.blob.vercel-storage.com/document-current.md",
    assetBaseUrl: null,
  };
  return {
    schemaVersion: 3,
    id: "document-1",
    slug: "laboratorio",
    folder: "aws-labs/v1/documents/laboratorio-abc123",
    originalFileName: "laboratorio.md",
    status: "published",
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
        originalFileName: "laboratorio.md",
        status: "published",
        metadata,
        content,
        createdAt: timestamp,
        updatedAt: timestamp,
        publishedAt: timestamp,
        deletedAt: null,
      },
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    publishedAt: timestamp,
    deletedAt: null,
  };
}
