import { describe, expect, it } from "vitest";

import {
  assertSafeBlobPath,
  contentPaths,
  normalizeRelativeAssetPath,
  resolveRelativeAssetPath,
  slugify,
} from "./application/document-paths";
import { cleanupRemainingMinutes } from "./application/document-retention";
import { assertAssetSignature } from "./application/asset-validation";
import { processHtmlContent } from "./application/html-content";
import { assertSafeMarkdownUrls } from "./application/markdown-content";
import {
  metadataSchema,
  createDocumentSchema,
  taxonomySchema,
} from "./infrastructure/validation/schemas";
import { resolveSharedAssetReferences } from "./application/shared-asset-localization";
import {
  finalizeTaxonomyLocalizations,
  updateLocalizedTaxonomyName,
} from "./application/taxonomy-localization";
import { convertDocxHtmlToMarkdown } from "./infrastructure/browser/mammoth-docx-converter";
import {
  prepareHtmlContent,
  prepareMarkdownContent,
} from "./infrastructure/browser/direct-content-converter";
import {
  normalizeBlobEtag,
  versionedBlobUrl,
} from "./infrastructure/vercel-blob/blob-etag";
import { normalizeDocumentManifest } from "./infrastructure/vercel-blob/content-normalization";
import { assertTaxonomySelection } from "./server/taxonomy-selection";

describe("content management contracts", () => {
  it("normaliza nombres y mantiene un identificador para evitar colisiones", () => {
    const slug = slugify("  Guía de AWS: S3.docx  ");
    expect(slug).toBe("guia-de-aws-s3");
    expect(contentPaths.documentFolder(slug, "abc123")).toBe(
      "aws-labs/v1/documents/guia-de-aws-s3-abc123",
    );
  });

  it("genera rutas de contenido y taxonomía separadas por idioma", () => {
    expect(
      contentPaths.content(
        "aws-labs/v1/documents/lab-id",
        "en",
        "generation",
        "markdown",
      ),
    ).toBe("aws-labs/v1/documents/lab-id/en/document-generation.md");
    expect(contentPaths.taxonomyLocaleVersion("es", "generation")).toBe(
      "aws-labs/v1/system/taxonomy/es/taxonomy-generation.json",
    );
  });

  it("exige español al crear y no permite repetir idiomas", () => {
    const base = {
      intentToken: "token",
      assets: [],
      order: null,
      categoryId: null,
      subcategoryId: null,
    };
    const variant = {
      locale: "en" as const,
      originalFileName: "lab.md",
      contentKind: "markdown" as const,
      source: "# Lab",
      metadata: {
        title: "Lab",
        summary: "",
        author: "",
        tags: [],
        extra: {},
      },
    };
    expect(() =>
      createDocumentSchema.parse({ ...base, variants: [variant] }),
    ).toThrow("La versión en español es obligatoria");
    expect(() =>
      createDocumentSchema.parse({
        ...base,
        variants: [
          { ...variant, locale: "es" },
          { ...variant, locale: "es" },
        ],
      }),
    ).toThrow("No se puede repetir un idioma");
  });

  it("reutiliza imágenes españolas por hash y rechaza imágenes nuevas", () => {
    const shared = [
      {
        index: 0,
        relativePath: "images/es.png",
        sha256: "abc",
        placeholder: "__DOCX_ASSET_0__",
      },
    ];
    const uploaded = [
      {
        index: 0,
        relativePath: "images/stored.png",
        sha256: "abc",
      },
    ];
    expect(
      resolveSharedAssetReferences(
        "![Diagram](__DOCX_ASSET_8__)",
        [
          {
            index: 8,
            relativePath: "images/en.png",
            sha256: "abc",
            placeholder: "__DOCX_ASSET_8__",
          },
        ],
        shared,
        uploaded,
      ),
    ).toBe("![Diagram](./images/stored.png)");
    expect(() =>
      resolveSharedAssetReferences(
        "![New](new.png)",
        [
          {
            index: 1,
            relativePath: "new.png",
            sha256: "different",
            placeholder: null,
          },
        ],
        shared,
        uploaded,
      ),
    ).toThrow("La traducción contiene un recurso nuevo");
  });

  it("rechaza rutas fuera del prefijo administrado", () => {
    expect(() =>
      assertSafeBlobPath("aws-labs/v1/documents/a/image.png"),
    ).not.toThrow();
    expect(() => assertSafeBlobPath("../secrets.txt")).toThrow();
    expect(() => assertSafeBlobPath("aws-labs/v1/../secrets.txt")).toThrow();
  });

  it("normaliza rutas relativas y rechaza traversal", () => {
    expect(normalizeRelativeAssetPath("img/Diagrama final.png")).toBe(
      "img/Diagrama final.png",
    );
    expect(() => normalizeRelativeAssetPath("../secreto.txt")).toThrow();
    expect(
      resolveRelativeAssetPath("styles/theme/main.css", "../fonts/inter.woff2"),
    ).toBe("styles/fonts/inter.woff2");
    expect(() =>
      resolveRelativeAssetPath("main.css", "../fuera.png"),
    ).toThrow();
  });

  it("sanea HTML activo y conserva recursos estáticos", () => {
    const result =
      processHtmlContent(`<!doctype html><html><head><title>Lab</title></head><body>
      <script>alert(1)</script><img src="img/diagrama.png" onerror="alert(1)">
      <a href="javascript:alert(1)">peligro</a><form action="https://example.com"><button>Enviar</button></form>
    </body></html>`);
    expect(result.title).toBe("Lab");
    expect(result.html).not.toContain("<script");
    expect(result.html).not.toContain("onerror");
    expect(result.html).not.toContain("javascript:");
    expect(result.html).not.toContain("<form");
    expect(result.localReferences).toEqual(["img/diagrama.png"]);
  });

  it("bloquea traversal y protocolos inseguros dentro de CSS", () => {
    expect(() => processHtmlContent('<img src="../../secreto.png">')).toThrow();
    expect(() =>
      processHtmlContent(
        "<style>body{background:url(http://example.com/a.png)}</style>",
      ),
    ).toThrow();
  });

  it("rechaza recursos cuyo contenido no coincide con el MIME", () => {
    expect(() =>
      assertAssetSignature(
        new TextEncoder().encode("no es una imagen"),
        "image/png",
        "falsa.png",
      ),
    ).toThrow();
  });

  it("acepta enlaces HTTPS y rechaza protocolos peligrosos en Markdown", () => {
    expect(() =>
      assertSafeMarkdownUrls("[AWS](https://aws.amazon.com)"),
    ).not.toThrow();
    expect(() =>
      assertSafeMarkdownUrls("[malicioso](javascript:alert(1))"),
    ).toThrow();
    expect(() =>
      assertSafeMarkdownUrls("[inseguro](http://example.com)"),
    ).toThrow();
  });

  it("normaliza manifiestos Markdown v1 sin migración destructiva", () => {
    const normalized = normalizeDocumentManifest({
      schemaVersion: 1,
      id: "legacy",
      slug: "legacy",
      folder: "aws-labs/v1/documents/legacy-id",
      originalFileName: "legacy.docx",
      status: "published",
      metadata: {
        title: "Legacy",
        summary: "",
        author: "",
        tags: [],
        order: null,
        extra: {},
      },
      categoryId: null,
      subcategoryId: null,
      markdownPathname: "aws-labs/v1/documents/legacy-id/document-old.md",
      markdownUrl:
        "https://store.public.blob.vercel-storage.com/aws-labs/v1/documents/legacy-id/document-old.md",
      assets: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      publishedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
    });
    expect(normalized.schemaVersion).toBe(3);
    expect(normalized.localizations.es?.status).toBe("published");
    expect(normalized.content.kind).toBe("markdown");
    expect(normalized.content.pathname).toContain("document-old.md");
  });

  it("conserva ambas localizaciones al leer manifiestos v3", () => {
    const now = "2026-07-17T00:00:00.000Z";
    const localization = (
      locale: "es" | "en",
      slug: string,
      title: string,
    ) => ({
      locale,
      slug,
      originalFileName: `${slug}.md`,
      status: "published",
      metadata: {
        title,
        summary: "",
        author: "",
        tags: [],
        order: null,
        extra: {},
      },
      content: {
        kind: "markdown",
        pathname: `aws-labs/v1/documents/lab-id/${locale}/document.md`,
        url: `https://store.public.blob.vercel-storage.com/lab-id/${locale}/document.md`,
        assetBaseUrl: null,
      },
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      deletedAt: null,
    });
    const normalized = normalizeDocumentManifest({
      schemaVersion: 3,
      id: "lab-id",
      folder: "aws-labs/v1/documents/lab-id",
      canonicalKey: "laboratorio",
      order: 1,
      categoryId: null,
      subcategoryId: null,
      assets: [],
      localizations: {
        es: localization("es", "laboratorio", "Laboratorio"),
        en: localization("en", "laboratory", "Laboratory"),
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    expect(normalized.localizations.en?.slug).toBe("laboratory");
    expect(normalized.localizations.en?.metadata.title).toBe("Laboratory");
    expect(normalized.slug).toBe("laboratorio");
  });

  it("importa frontmatter Markdown, retira YAML y reescribe imágenes", async () => {
    const image = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      "diagrama.png",
      { type: "image/png" },
    );
    const result = await prepareMarkdownContent(
      "---\ntitle: Laboratorio VPC\nauthor: Felipe\ndificultad: intermedio\n---\n\n![Diagrama](diagrama.png)",
      "laboratorio.md",
      [image],
    );
    expect(result.source).not.toContain("---");
    expect(result.source).toContain("./assets/diagrama.png");
    expect(result.metadata).toMatchObject({
      title: "Laboratorio VPC",
      author: "Felipe",
      extra: { dificultad: "intermedio" },
    });
  });

  it("valida dependencias CSS anidadas de HTML", async () => {
    const css = assetFile(
      "styles/site.css",
      "body{background:url(../images/fondo.png)}",
      "text/css",
    );
    const image = assetFile(
      "images/fondo.png",
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      "image/png",
    );
    const result = await prepareHtmlContent(
      '<html><head><title>HTML Lab</title><link rel="stylesheet" href="styles/site.css"></head><body></body></html>',
      "lab.html",
      [css, image],
    );
    expect(result.title).toBe("HTML Lab");
    expect(result.assets).toHaveLength(2);
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
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
      categories: [
        {
          id: "storage",
          slug: "storage",
          name: "Storage",
          localizations: {
            es: { slug: "storage", name: "Storage" },
            en: { slug: "storage", name: "Storage" },
          },
          subcategories: [
            {
              id: "s3",
              slug: "s3",
              name: "S3",
              localizations: {
                es: { slug: "s3", name: "S3" },
                en: { slug: "s3", name: "S3" },
              },
            },
          ],
        },
      ],
    });
    expect(() =>
      assertTaxonomySelection(taxonomy, "storage", "s3"),
    ).not.toThrow();
    expect(() => assertTaxonomySelection(taxonomy, "storage", "ec2")).toThrow();
  });

  it("mantiene únicos los slugs localizados de taxonomía", () => {
    const duplicated = {
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
      categories: ["one", "two"].map((id) => ({
        id,
        slug: id,
        name: id,
        localizations: {
          es: { slug: "duplicada", name: id },
        },
        subcategories: [],
      })),
    };
    expect(() => taxonomySchema.parse(duplicated)).toThrow(
      "El slug de categoría ya existe en ES",
    );
  });

  it("genera el slug localizado con el nombre completo al guardar", () => {
    const firstEdit = updateLocalizedTaxonomyName(
      { es: { name: "Entregable 1", slug: "entregable-1" } },
      "en",
      "E",
    );
    const completedEdit = updateLocalizedTaxonomyName(
      firstEdit,
      "en",
      "Evaluation 1",
    );
    expect(completedEdit.en?.slug).toBe("");

    expect(
      finalizeTaxonomyLocalizations(completedEdit, "subcategory-id"),
    ).toEqual({
      es: { name: "Entregable 1", slug: "entregable-1" },
      en: { name: "Evaluation 1", slug: "evaluation-1" },
    });
  });

  it("mantiene estable un slug localizado después del primer guardado", () => {
    const edited = updateLocalizedTaxonomyName(
      {
        es: { name: "Laboratorios", slug: "laboratorios" },
        en: { name: "Labs", slug: "labs" },
      },
      "en",
      "AWS Labs",
    );
    expect(finalizeTaxonomyLocalizations(edited, "category-id").en).toEqual({
      name: "AWS Labs",
      slug: "labs",
    });
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

function assetFile(
  relativePath: string,
  content: string | Uint8Array,
  type: string,
): File {
  const body =
    typeof content === "string"
      ? content
      : (content.buffer.slice(
          content.byteOffset,
          content.byteOffset + content.byteLength,
        ) as ArrayBuffer);
  const file = new File([body], relativePath.split("/").at(-1) ?? "asset", {
    type,
  });
  Object.defineProperty(file, "__relativeAssetPath", { value: relativePath });
  return file;
}
