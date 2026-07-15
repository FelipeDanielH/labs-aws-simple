import { describe, expect, it } from "vitest";

import {
  assertSafeBlobPath,
  contentPaths,
  slugify,
} from "./application/document-paths";
import {
  metadataSchema,
  taxonomySchema,
} from "./infrastructure/validation/schemas";
import { assertTaxonomySelection } from "./server/taxonomy-selection";

describe("content management contracts", () => {
  it("normaliza nombres y mantiene un identificador para evitar colisiones", () => {
    const slug = slugify("  Guía de AWS: S3.docx  ");
    expect(slug).toBe("guia-de-aws-s3");
    expect(contentPaths.documentFolder(slug, "abc123")).toBe(
      "aws-labs/v1/documents/guia-de-aws-s3-abc123",
    );
  });

  it("rechaza rutas fuera del prefijo administrado", () => {
    expect(() =>
      assertSafeBlobPath("aws-labs/v1/documents/a/image.png"),
    ).not.toThrow();
    expect(() => assertSafeBlobPath("../secrets.txt")).toThrow();
    expect(() => assertSafeBlobPath("aws-labs/v1/../secrets.txt")).toThrow();
  });

  it("valida metadata estructurada y extensible", () => {
    const metadata = metadataSchema.parse({
      title: "Laboratorio S3",
      summary: "Resumen",
      author: "AWS Labs",
      tags: ["aws", "s3"],
      order: 2,
      extra: { difficulty: "introductorio", duration: 45, reviewed: true },
    });
    expect(metadata.extra.duration).toBe(45);
  });

  it("exige que la subcategoría pertenezca a la categoría", () => {
    const taxonomy = taxonomySchema.parse({
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      categories: [
        {
          id: "storage",
          slug: "storage",
          name: "Storage",
          subcategories: [{ id: "s3", slug: "s3", name: "S3" }],
        },
      ],
    });
    expect(() =>
      assertTaxonomySelection(taxonomy, "storage", "s3"),
    ).not.toThrow();
    expect(() => assertTaxonomySelection(taxonomy, "storage", "ec2")).toThrow();
  });
});
