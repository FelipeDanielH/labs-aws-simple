import { parse as parseYaml } from "yaml";

import {
  collectCssReferences,
  normalizeReference,
  processHtmlContent,
} from "../../application/html-content";
import {
  normalizeRelativeAssetPath,
  resolveRelativeAssetPath,
  slugify,
} from "../../application/document-paths";
import { assertAssetSignature } from "../../application/asset-validation";
import { assertSafeMarkdownUrls } from "../../application/markdown-content";
import type { DocumentMetadata, MetadataValue } from "../../domain/models";

export const DIRECT_DOCUMENT_MAX_BYTES = 2 * 1024 * 1024;
export const ASSET_MAX_BYTES = 25 * 1024 * 1024;
export const ASSET_TOTAL_MAX_BYTES = 100 * 1024 * 1024;
export const ASSET_MAX_COUNT = 200;

export type BrowserAsset = {
  file: File;
  originalName: string;
  relativePath: string;
  contentType: string;
  size: number;
  sha256: string;
  extension: string;
};

export type PreparedDirectContent = {
  source: string;
  title: string;
  metadata: Partial<DocumentMetadata>;
  assets: BrowserAsset[];
  warnings: string[];
};

const MARKDOWN_ASSET_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
]);
const HTML_ASSET_TYPES = new Set([
  ...MARKDOWN_ASSET_TYPES,
  "text/css",
  "font/woff",
  "font/woff2",
  "font/ttf",
  "font/otf",
  "application/font-woff",
  "application/font-sfnt",
]);

export async function prepareMarkdownContent(
  rawSource: string,
  originalFileName: string,
  files: File[],
): Promise<PreparedDirectContent> {
  assertUtf8Document(rawSource, originalFileName, ".md");
  const frontmatter = extractFrontmatter(rawSource);
  const assets = await prepareAssets(files, MARKDOWN_ASSET_TYPES);
  const assetPaths = new Set(assets.map((asset) => asset.relativePath));
  const missing = new Set<string>();
  const source = frontmatter.body.replace(
    /(!\[[^\]]*\]\()([^\s)]+)([^)]*\))/g,
    (whole, prefix: string, url: string, suffix: string) => {
      const normalized = normalizeReference(url);
      if (normalized.kind === "blocked") {
        throw new Error(`Markdown contiene una URL no permitida: ${url}`);
      }
      if (normalized.kind === "external") return whole;
      const relativeValue = normalized.value.replace(/^assets\//, "");
      const path = relativeValue.split(/[?#]/u)[0];
      if (!assetPaths.has(path)) missing.add(path);
      return `${prefix}./assets/${relativeValue}${suffix}`;
    },
  );
  assertNoMissing(missing);
  assertSafeMarkdownUrls(source);
  const h1 = source.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return {
    source,
    title:
      frontmatter.metadata.title ??
      h1 ??
      slugify(originalFileName).replaceAll("-", " "),
    metadata: frontmatter.metadata,
    assets,
    warnings: [],
  };
}

export async function prepareHtmlContent(
  rawSource: string,
  originalFileName: string,
  files: File[],
): Promise<PreparedDirectContent> {
  assertUtf8Document(rawSource, originalFileName, ".html");
  const processed = processHtmlContent(rawSource);
  const assets = await prepareAssets(files, HTML_ASSET_TYPES);
  const assetPaths = new Set(assets.map((asset) => asset.relativePath));
  const required = new Set(processed.localReferences.map(withoutQuery));

  for (const asset of assets.filter(
    (item) => item.contentType === "text/css",
  )) {
    const css = await asset.file.text();
    for (const reference of collectCssReferences(css, new Set(), true)) {
      const resolved = resolveRelativeAssetPath(
        asset.relativePath,
        withoutQuery(reference),
      );
      required.add(resolved);
    }
  }
  assertNoMissing(
    new Set([...required].filter((path) => !assetPaths.has(path))),
  );

  return {
    source: processed.html,
    title: processed.title ?? slugify(originalFileName).replaceAll("-", " "),
    metadata: {},
    assets,
    warnings: processed.warnings,
  };
}

export function companionFiles(input: FileList | null): File[] {
  if (!input) return [];
  return [...input].map((file) => {
    const path = file.webkitRelativePath || file.name;
    const parts = path.replaceAll("\\", "/").split("/");
    const relative = parts.length > 1 ? parts.slice(1).join("/") : parts[0];
    Object.defineProperty(file, "__relativeAssetPath", {
      value: relative,
      configurable: true,
    });
    return file;
  });
}

async function prepareAssets(
  files: File[],
  allowed: Set<string>,
): Promise<BrowserAsset[]> {
  if (files.length > ASSET_MAX_COUNT) {
    throw new Error(`Puedes seleccionar hasta ${ASSET_MAX_COUNT} recursos.`);
  }
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > ASSET_TOTAL_MAX_BYTES)
    throw new Error("Los recursos superan 100 MiB.");

  return Promise.all(
    files.map(async (file) => {
      if (file.size > ASSET_MAX_BYTES) {
        throw new Error(`${file.name} supera el límite de 25 MiB.`);
      }
      const contentType = normalizeMime(file);
      if (!allowed.has(contentType)) {
        throw new Error(`${file.name} no es un tipo de recurso permitido.`);
      }
      assertAssetSignature(
        new Uint8Array(await file.slice(0, 4096).arrayBuffer()),
        contentType,
        file.name,
      );
      const originalPath =
        (file as File & { __relativeAssetPath?: string }).__relativeAssetPath ??
        file.name;
      const relativePath = normalizeRelativeAssetPath(originalPath);
      return {
        file,
        originalName: file.name,
        relativePath,
        contentType,
        size: file.size,
        sha256: await sha256(file),
        extension: extension(file.name),
      };
    }),
  );
}

function extractFrontmatter(source: string): {
  body: string;
  metadata: Partial<DocumentMetadata>;
} {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { body: source, metadata: {} };
  const parsed = parseYaml(match[1] ?? "") as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("El frontmatter YAML no es válido.");
  }
  const known = new Set([
    "title",
    "summary",
    "author",
    "tags",
    "order",
    "extra",
  ]);
  const metadata: Partial<DocumentMetadata> = {};
  if (typeof parsed.title === "string") metadata.title = parsed.title;
  if (typeof parsed.summary === "string") metadata.summary = parsed.summary;
  if (typeof parsed.author === "string") metadata.author = parsed.author;
  if (Array.isArray(parsed.tags)) metadata.tags = parsed.tags.map(String);
  if (typeof parsed.order === "number" && Number.isInteger(parsed.order)) {
    metadata.order = parsed.order;
  }
  const extra: Record<string, MetadataValue> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!known.has(key) && isMetadataValue(value)) extra[key] = value;
  }
  if (
    parsed.extra &&
    typeof parsed.extra === "object" &&
    !Array.isArray(parsed.extra)
  ) {
    for (const [key, value] of Object.entries(parsed.extra)) {
      if (isMetadataValue(value)) extra[key] = value;
    }
  }
  if (Object.keys(extra).length) metadata.extra = extra;
  return { body: source.slice(match[0].length), metadata };
}

function assertUtf8Document(
  source: string,
  fileName: string,
  extensionName: string,
) {
  if (new Blob([source]).size > DIRECT_DOCUMENT_MAX_BYTES) {
    throw new Error("El documento principal supera 2 MiB.");
  }
  if (
    fileName !== "nuevo.md" &&
    !fileName.toLowerCase().endsWith(extensionName)
  ) {
    throw new Error(`El archivo debe tener extensión ${extensionName}.`);
  }
  if (source.includes("\u0000"))
    throw new Error("El documento no es UTF-8 válido.");
}

function assertNoMissing(missing: Set<string>) {
  if (missing.size) {
    throw new Error(
      `Faltan recursos locales: ${[...missing].slice(0, 5).join(", ")}`,
    );
  }
}

function normalizeMime(file: File): string {
  const ext = extension(file.name);
  const byExtension: Record<string, string> = {
    css: "text/css",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    svg: "image/svg+xml",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    otf: "font/otf",
  };
  return (
    byExtension[ext] ?? (file.type.toLowerCase() || "application/octet-stream")
  );
}

function extension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "bin";
}

function withoutQuery(value: string): string {
  return value.split(/[?#]/u)[0].replace(/^\.\//, "");
}

function isMetadataValue(value: unknown): value is MetadataValue {
  const scalar = (item: unknown) =>
    typeof item === "string" ||
    typeof item === "number" ||
    typeof item === "boolean";
  return scalar(value) || (Array.isArray(value) && value.every(scalar));
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
