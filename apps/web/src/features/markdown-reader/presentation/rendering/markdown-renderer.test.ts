import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownRenderer } from "./markdown-renderer";
import { transformMarkdownUrl } from "./markdown-renderer";

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
