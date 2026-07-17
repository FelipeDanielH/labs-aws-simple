import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownRenderer } from "./markdown-renderer";
import { transformMarkdownUrl } from "./markdown-renderer";
import { extractMarkdownTableOfContents } from "./markdown-heading-index";

describe("MarkdownRenderer", () => {
  it("resuelve imágenes relativas contra la carpeta Blob del Markdown", () => {
    expect(
      transformMarkdownUrl(
        "./images/diagram.png",
        "https://store.public.blob.vercel-storage.com/aws-labs/v1/documents/lab/document-a.md",
      ),
    ).toBe(
      "https://store.public.blob.vercel-storage.com/aws-labs/v1/documents/lab/images/diagram.png",
    );
  });
  it("renderiza CommonMark, GFM y HTML semántico", () => {
    const source = `# Documento

| Estado | Valor |
| --- | --- |
| OK | 1 |

<details open>
  <summary>Información</summary>
  <mark>Contenido HTML visible</mark>
</details>`;
    const markup = renderToStaticMarkup(
      createElement(MarkdownRenderer, { source }),
    );

    expect(markup).toContain("<h1");
    expect(markup).toContain("<table");
    expect(markup).toContain("<details");
    expect(markup).toContain("<mark>Contenido HTML visible</mark>");
  });

  it("genera un índice y anclas estables para encabezados Markdown", () => {
    const source = `# Laboratorio

## Objetivo general

### Red y **seguridad**

#### Controles preventivos

##### Detalle fuera del índice

## Objetivo general`;
    const tableOfContents = extractMarkdownTableOfContents(source);
    const markup = renderToStaticMarkup(
      createElement(MarkdownRenderer, { source }),
    );

    expect(tableOfContents).toEqual([
      {
        id: "section-laboratorio",
        title: "Laboratorio",
        level: 1,
      },
      {
        id: "section-objetivo-general",
        title: "Objetivo general",
        level: 2,
      },
      {
        id: "section-red-y-seguridad",
        title: "Red y seguridad",
        level: 3,
      },
      {
        id: "section-controles-preventivos",
        title: "Controles preventivos",
        level: 4,
      },
      {
        id: "section-objetivo-general-1",
        title: "Objetivo general",
        level: 2,
      },
    ]);
    expect(markup).toMatch(/<h1[^>]*id="section-laboratorio"/);
    expect(markup).toMatch(/<h2[^>]*id="section-objetivo-general"/);
    expect(markup).toMatch(/<h3[^>]*id="section-red-y-seguridad"/);
    expect(markup).toMatch(/<h4[^>]*id="section-controles-preventivos"/);
    expect(markup).toMatch(/<h2[^>]*id="section-objetivo-general-1"/);
    expect(markup).not.toContain("data-toc-id");
  });

  it("neutraliza scripts, eventos y protocolos ejecutables", () => {
    const source = `<div onclick="alert('xss')">Contenido seguro</div>

<script>alert('xss')</script>

<a href="javascript:alert('xss')">Enlace peligroso</a>

<custom-widget data-action="run">Contenido personalizado</custom-widget>`;
    const markup = renderToStaticMarkup(
      createElement(MarkdownRenderer, { source }),
    );

    expect(markup).toContain("Contenido seguro");
    expect(markup).toContain('data-blocked-html="script"');
    expect(markup).toContain('data-blocked-html="custom-widget"');
    expect(markup).toContain("Contenido personalizado");
    expect(markup).toContain("alert(&#x27;xss&#x27;)");
    expect(markup).not.toContain("<script");
    expect(markup).not.toContain("onclick");
    expect(markup).not.toContain("javascript:");
  });

  it("aísla iframes y desactiva controles HTML", () => {
    const source = `<iframe src="https://example.com" sandbox="allow-scripts" allow="camera"></iframe>

<form action="https://example.com/collect">
  <input name="secret" value="dato">
  <button type="submit">Enviar</button>
</form>`;
    const markup = renderToStaticMarkup(
      createElement(MarkdownRenderer, { source }),
    );

    expect(markup).toContain("<iframe");
    expect(markup).toContain('sandbox=""');
    expect(markup).toContain('referrerPolicy="no-referrer"');
    expect(markup).not.toContain("allow-scripts");
    expect(markup).not.toContain("camera");
    expect(markup).not.toContain("<form");
    expect(markup).toContain("disabled");
  });
});
