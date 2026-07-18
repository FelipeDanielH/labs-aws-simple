import { head } from "@vercel/blob";

import {
  assertSafeBlobPath,
  resolveRelativeAssetPath,
} from "../application/document-paths";
import { assertAssetSignature } from "../application/asset-validation";
import { collectCssReferences } from "../application/html-content";
import type { UploadedAssetInput } from "../domain/models";

export type UploadedAssetClaim = {
  index: number;
  placeholder: string | null;
  originalName: string;
  relativePath: string;
  pathname: string;
  url: string;
  contentType: string;
  size: number;
  sha256: string;
};

export async function validateUploadedAssets(
  uploaded: UploadedAssetClaim[],
  allowedPathnames: string[],
): Promise<UploadedAssetInput[]> {
  let totalSize = 0;
  const assets: UploadedAssetInput[] = [];
  const nestedReferences: string[] = [];
  for (const asset of uploaded) {
    assertSafeBlobPath(asset.pathname);
    if (!allowedPathnames.includes(asset.pathname)) {
      throw new Error("Un recurso no pertenece al documento.");
    }
    const stored = await head(asset.pathname);
    if (
      stored.url !== asset.url ||
      stored.size !== asset.size ||
      stored.contentType !== asset.contentType
    ) {
      throw new Error("Un recurso subido no coincide con lo reservado.");
    }
    const response = await fetch(stored.url, { cache: "no-store" });
    if (!response.ok) throw new Error("No se pudo validar un recurso subido.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if ((await sha256(bytes)) !== asset.sha256) {
      throw new Error("El hash de un recurso subido no coincide.");
    }
    assertAssetSignature(bytes, stored.contentType, asset.originalName);
    if (stored.contentType === "text/css") {
      const css = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      for (const reference of collectCssReferences(css, new Set(), true)) {
        nestedReferences.push(
          resolveRelativeAssetPath(
            asset.relativePath,
            reference.split(/[?#]/u)[0],
          ),
        );
      }
    }
    totalSize += stored.size;
    if (totalSize > 100 * 1024 * 1024) {
      throw new Error("Los recursos superan 100 MiB.");
    }
    assets.push({
      originalName: asset.originalName,
      relativePath: asset.relativePath,
      pathname: asset.pathname,
      url: asset.url,
      contentType: asset.contentType,
      size: asset.size,
      sha256: asset.sha256,
    });
  }
  assertReferencesExist(nestedReferences, assets);
  return assets;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function assertReferencesExist(
  references: string[],
  assets: UploadedAssetInput[],
): void {
  const available = new Set(assets.map((asset) => asset.relativePath));
  const missing = references.filter((reference) => !available.has(reference));
  if (missing.length) {
    throw new Error(
      `Faltan recursos locales: ${missing.slice(0, 5).join(", ")}`,
    );
  }
}
