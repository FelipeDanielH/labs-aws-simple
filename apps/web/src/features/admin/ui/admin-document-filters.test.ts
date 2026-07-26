import { describe, expect, it } from "vitest";

import type {
  DocumentStatus,
  VersionedManifest,
} from "@/features/content-management/domain/models";

import {
  filterAdminDocuments,
  normalizeAdminDocumentSearch,
  type AdminDocumentFilters,
} from "./admin-document-filters";

const baseFilters: AdminDocumentFilters = {
  status: "all",
  searchQuery: "",
  taxonomy: {},
};

describe("admin document filters", () => {
  it("normaliza mayúsculas, espacios y acentos", () => {
    expect(normalizeAdminDocumentSearch("  Administración  ")).toBe(
      "administracion",
    );
  });

  it("busca en los títulos disponibles en español e inglés", () => {
    const documents = [
      document("Administración de archivos", "published", "File management"),
      document("Redes privadas", "published", "Private networking"),
    ];

    expect(
      filterAdminDocuments(documents, {
        ...baseFilters,
        searchQuery: "administracion",
      }),
    ).toEqual([documents[0]]);
    expect(
      filterAdminDocuments(documents, {
        ...baseFilters,
        searchQuery: "FILE MANAGEMENT",
      }),
    ).toEqual([documents[0]]);
  });

  it("aplica el estado antes de buscar por título", () => {
    const published = document("Laboratorio S3", "published");
    const draft = document("Laboratorio S3 avanzado", "draft");

    expect(
      filterAdminDocuments([published, draft], {
        ...baseFilters,
        status: "draft",
        searchQuery: "laboratorio",
      }),
    ).toEqual([draft]);
    expect(
      filterAdminDocuments([published, draft], {
        ...baseFilters,
        status: "published",
        searchQuery: "avanzado",
      }),
    ).toEqual([]);
  });

  it("devuelve el subconjunto completo cuando la consulta está vacía", () => {
    const published = document("Publicado", "published");
    const draft = document("Borrador", "draft");

    expect(
      filterAdminDocuments([published, draft], {
        ...baseFilters,
        status: "published",
        searchQuery: "  ",
      }),
    ).toEqual([published]);
  });

  it("filtra una categoría concreta o documentos sin categoría", () => {
    const categorized = document("Con categoría", "published", undefined, {
      categoryId: "storage",
      subcategoryId: "s3",
    });
    const uncategorized = document("Sin categoría", "published");

    expect(
      filterAdminDocuments([categorized, uncategorized], {
        ...baseFilters,
        taxonomy: { categoryId: "storage" },
      }),
    ).toEqual([categorized]);
    expect(
      filterAdminDocuments([categorized, uncategorized], {
        ...baseFilters,
        taxonomy: { categoryId: null },
      }),
    ).toEqual([uncategorized]);
  });

  it("filtra subcategorías después de limitar la categoría", () => {
    const s3 = document("S3", "published", undefined, {
      categoryId: "storage",
      subcategoryId: "s3",
    });
    const ebs = document("EBS", "published", undefined, {
      categoryId: "storage",
      subcategoryId: "ebs",
    });
    const withoutSubcategory = document(
      "Storage general",
      "published",
      undefined,
      {
        categoryId: "storage",
        subcategoryId: null,
      },
    );

    expect(
      filterAdminDocuments([s3, ebs, withoutSubcategory], {
        ...baseFilters,
        taxonomy: { categoryId: "storage", subcategoryId: "s3" },
      }),
    ).toEqual([s3]);
    expect(
      filterAdminDocuments([s3, ebs, withoutSubcategory], {
        ...baseFilters,
        taxonomy: { categoryId: "storage", subcategoryId: null },
      }),
    ).toEqual([withoutSubcategory]);
  });
});

function document(
  spanishTitle: string,
  status: DocumentStatus,
  englishTitle?: string,
  taxonomy: { categoryId: string | null; subcategoryId: string | null } = {
    categoryId: null,
    subcategoryId: null,
  },
): VersionedManifest {
  const localization = (locale: "es" | "en", title: string) => ({
    locale,
    slug: title.toLowerCase().replaceAll(" ", "-"),
    originalFileName: `${title}.md`,
    status,
    metadata: {
      title,
      summary: "",
      author: "",
      tags: [],
      extra: {},
    },
    content: {
      kind: "markdown" as const,
      pathname: `${locale}/document.md`,
      url: `https://example.com/${locale}/document.md`,
      assetBaseUrl: null,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    publishedAt: status === "published" ? "2026-01-01T00:00:00.000Z" : null,
    deletedAt: status === "trashed" ? "2026-01-01T00:00:00.000Z" : null,
  });
  const spanish = localization("es", spanishTitle);
  return {
    manifest: {
      schemaVersion: 3,
      id: spanishTitle,
      slug: spanish.slug,
      folder: spanish.slug,
      originalFileName: spanish.originalFileName,
      status,
      metadata: { ...spanish.metadata, order: null },
      canonicalKey: spanish.slug,
      order: null,
      categoryId: taxonomy.categoryId,
      subcategoryId: taxonomy.subcategoryId,
      content: spanish.content,
      assets: [],
      localizations: {
        es: spanish,
        ...(englishTitle
          ? { en: localization("en", englishTitle) }
          : undefined),
      },
      createdAt: spanish.createdAt,
      updatedAt: spanish.updatedAt,
      publishedAt: spanish.publishedAt,
      deletedAt: spanish.deletedAt,
    },
    etag: `etag-${spanishTitle}`,
  };
}
