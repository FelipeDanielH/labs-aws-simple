import mammoth from "mammoth";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

import type {
  ConvertedDocx,
  ConvertedDocxAsset,
  DocxConverter,
} from "../../application/ports/docx-converter";

const MAX_DOCX_SIZE = 25 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

export class MammothDocxConverter implements DocxConverter {
  async convert(file: File): Promise<ConvertedDocx> {
    validateDocx(file);
    const assets: ConvertedDocxAsset[] = [];
    const result = await mammoth.convertToHtml(
      { arrayBuffer: await file.arrayBuffer() },
      {
        externalFileAccess: false,
        includeEmbeddedStyleMap: true,
        includeDefaultStyleMap: true,
        styleMap: [
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Subtitle'] => h2:fresh",
          "p[style-name='Code Block'] => pre:separator('\\n')",
        ],
        convertImage: mammoth.images.imgElement(async (image) => {
          if (!ALLOWED_IMAGE_TYPES.has(image.contentType)) {
            throw new Error(
              `Formato de imagen no soportado: ${image.contentType}`,
            );
          }
          const index = assets.length;
          const arrayBuffer = await image.readAsArrayBuffer();
          const sha256 = await digestHex(arrayBuffer);
          const extension = extensionFor(image.contentType);
          const placeholder = `__DOCX_ASSET_${index}__`;
          assets.push({
            index,
            placeholder,
            blob: new Blob([arrayBuffer], { type: image.contentType }),
            contentType: image.contentType,
            extension,
            sha256,
          });
          return { src: placeholder };
        }),
      },
    );

    const turndown = new TurndownService({
      headingStyle: "atx",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
      emDelimiter: "*",
      strongDelimiter: "**",
    });

    return {
      markdown: convertDocxHtmlToMarkdown(result.value, turndown),
      assets,
      warnings: result.messages.map((message) => message.message),
    };
  }
}

export function convertDocxHtmlToMarkdown(
  html: string,
  service = createTurndownService(),
): string {
  service.use(gfm);
  service.addRule("docxTables", {
    filter: (node) => node.nodeName === "TABLE",
    replacement: (_content, node) =>
      convertTable(node as HTMLTableElement, service),
  });
  service.keep(["details", "summary", "iframe", "video", "audio"]);
  return normalizeMarkdown(service.turndown(html));
}

function createTurndownService(): TurndownService {
  return new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
  });
}

function convertTable(
  table: HTMLTableElement,
  service: TurndownService,
): string {
  const rows = Array.from(table.rows);
  if (!rows.length) return "";
  if (
    rows.some((row) =>
      Array.from(row.cells).some(
        (cell) => cell.colSpan > 1 || cell.rowSpan > 1,
      ),
    )
  ) {
    return `\n\n${table.outerHTML}\n\n`;
  }

  const width = Math.max(...rows.map((row) => row.cells.length));
  const markdownRows = rows.map((row) => {
    const cells = Array.from(row.cells, (cell) =>
      normalizeTableCell(service.turndown(cell.innerHTML)),
    );
    while (cells.length < width) cells.push("");
    return `| ${cells.join(" | ")} |`;
  });
  const separator = `| ${Array.from({ length: width }, () => "---").join(" | ")} |`;
  return `\n\n${markdownRows[0]}\n${separator}\n${markdownRows.slice(1).join("\n")}\n\n`;
}

function normalizeTableCell(markdown: string): string {
  return markdown
    .trim()
    .replace(/\r?\n+/g, "<br>")
    .replace(/(?<!\\)\|/g, "\\|")
    .replace(/^(?:<br>)+|(?:<br>)+$/g, "");
}

function validateDocx(file: File) {
  if (!file.name.toLowerCase().endsWith(".docx")) {
    throw new Error("Selecciona un archivo .docx válido.");
  }
  if (file.size > MAX_DOCX_SIZE) {
    throw new Error("El DOCX supera el límite de 25 MiB.");
  }
}

async function digestHex(value: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function extensionFor(contentType: string): string {
  return (
    {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/gif": "gif",
      "image/webp": "webp",
      "image/svg+xml": "svg",
    }[contentType] ?? "bin"
  );
}

function normalizeMarkdown(value: string): string {
  return value.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
