import { describe, expect, it } from "vitest";

import {
  assertSafeBlobPath,
  contentPaths,
  slugify,
} from "./application/document-paths";
import { cleanupRemainingMinutes } from "./application/document-retention";
import {
  metadataSchema,
  taxonomySchema,
} from "./infrastructure/validation/schemas";
import { convertDocxHtmlToMarkdown } from "./infrastructure/browser/mammoth-docx-converter";
import {
  normalizeBlobEtag,
  versionedBlobUrl,
} from "./infrastructure/vercel-blob/blob-etag";
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

  it("normaliza ETags HTTP antes de comparar versiones", () => {
    expect(normalizeBlobEtag('"version-1"')).toBe("version-1");
    expect(normalizeBlobEtag('W/"version-1"')).toBe("version-1");
    expect(normalizeBlobEtag(" version-1 ")).toBe("version-1");
  });

  it("versiona lecturas Blob mutables con el ETag actual", () => {
    expect(
      versionedBlobUrl(
        "https://store.public.blob.vercel-storage.com/manifest.json",
        'W/"version-2"',
      ),
    ).toBe(
      "https://store.public.blob.vercel-storage.com/manifest.json?v=version-2",
    );
  });

  it("calcula los minutos restantes para limpiar desde updatedAt", () => {
    const updatedAt = "2026-07-15T12:00:00.000Z";
    expect(
      cleanupRemainingMinutes(updatedAt, Date.parse("2026-07-15T12:03:01Z")),
    ).toBe(7);
    expect(
      cleanupRemainingMinutes(updatedAt, Date.parse("2026-07-15T12:10:00Z")),
    ).toBe(0);
  });

  it("convierte tablas DOCX con celdas de párrafo a GFM válido", () => {
    const markdown = convertDocxHtmlToMarkdown(`
      <table>
        <tr>
          <td><p><strong>Recurso</strong></p></td>
          <td><p><strong>Descripción</strong></p></td>
        </tr>
        <tr>
          <td><p>Amazon EC2</p></td>
          <td><p>Primera línea</p><p>Segunda línea | detalle</p></td>
        </tr>
      </table>
    `);

    expect(markdown).toContain(
      "| **Recurso** | **Descripción** |\n| --- | --- |",
    );
    expect(markdown).toContain(
      "| Amazon EC2 | Primera línea<br>Segunda línea \\| detalle |",
    );
  });

  it("conserva como HTML las tablas DOCX con celdas combinadas", () => {
    const markdown = convertDocxHtmlToMarkdown(
      '<table><tr><td colspan="2">Celda combinada</td></tr></table>',
    );
    expect(markdown).toContain('<td colspan="2">Celda combinada</td>');
  });
});
