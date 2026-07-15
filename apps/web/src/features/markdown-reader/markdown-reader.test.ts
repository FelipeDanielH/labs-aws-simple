import { describe, expect, it } from "vitest";

import { LoadMarkdownDocument } from "./application/use-cases/load-markdown-document";
import { RemarkMarkdownParser } from "./infrastructure/parsers/remark-markdown-parser";

const parser = new RemarkMarkdownParser();

describe("RemarkMarkdownParser", () => {
  it("convierte encabezados y formato inline a nodos de dominio", () => {
    const blocks = parser.parse("# Título\n\nTexto con **énfasis fuerte**.");

    expect(blocks[0]).toEqual({
      type: "heading",
      depth: 1,
      children: [{ type: "text", value: "Título" }],
    });
    expect(blocks[1]).toMatchObject({
      type: "paragraph",
      children: [
        { type: "text", value: "Texto con " },
        {
          type: "strong",
          children: [{ type: "text", value: "énfasis fuerte" }],
        },
        { type: "text", value: "." },
      ],
    });
  });

  it("reconoce extensiones GFM sin acoplar el dominio a MDAST", () => {
    const blocks = parser.parse(
      "- [x] Listo\n- [ ] Pendiente\n\n| A | B |\n| - | - |\n| 1 | 2 |",
    );

    expect(blocks[0]).toMatchObject({
      type: "list",
      items: [{ checked: true }, { checked: false }],
    });
    expect(blocks[1]).toMatchObject({
      type: "table",
      rows: [
        { cells: [[{ value: "A" }], [{ value: "B" }]] },
        { cells: [[{ value: "1" }], [{ value: "2" }]] },
      ],
    });
  });

  it("marca HTML en el AST de análisis sin ejecutarlo", () => {
    const blocks = parser.parse("<script>alert('unsafe')</script>");

    expect(blocks[0]).toEqual({
      type: "unsupported-block",
      sourceType: "html",
    });
  });
});

describe("LoadMarkdownDocument", () => {
  it("lee un archivo compatible con File y conserva sus metadatos", async () => {
    const loader = new LoadMarkdownDocument(parser);
    const document = await loader.execute({
      name: "guia.md",
      size: 8,
      type: "text/markdown",
      text: async () => "## Guía",
    });

    expect(document.name).toBe("guia.md");
    expect(document.blocks[0]).toMatchObject({ type: "heading", depth: 2 });
  });

  it("rechaza extensiones ajenas a Markdown con un error tipado", async () => {
    const loader = new LoadMarkdownDocument(parser);

    await expect(
      loader.execute({
        name: "notas.txt",
        size: 5,
        type: "text/plain",
        text: async () => "texto",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_FILE_EXTENSION",
    });
  });
});
