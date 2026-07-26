import { head } from "@vercel/blob";

import {
  assertSafeBlobPath,
  resolveRelativeAssetPath,
} from "../application/document-paths";
import { assertAssetSignature } from "../application/asset-validation";
import { collectCssReferences } from "../application/html-content";
import { ContentManagementError } from "../domain/errors";
import type { UploadedAssetInput } from "../domain/models";
import { blobAuthOptions } from "./blob-auth";

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
  reusableAssets: UploadedAssetClaim[] = [],
): Promise<UploadedAssetInput[]> {
  let totalSize = 0;
  const assets: UploadedAssetInput[] = [];
  const nestedReferences: string[] = [];
  for (const asset of uploaded) {
    assertSafeBlobPath(asset.pathname);
    if (!allowedPathnames.includes(asset.pathname)) {
      const reusable = reusableAssets.find(
        (candidate) =>
          candidate.pathname === asset.pathname &&
          candidate.url === asset.url &&
          candidate.relativePath === asset.relativePath &&
          candidate.contentType === asset.contentType &&
          candidate.size === asset.size &&
          candidate.sha256 === asset.sha256,
      );
      if (!reusable) {
        throw new Error("Un recurso no pertenece al documento.");
      }
      totalSize += reusable.size;
      if (totalSize > 100 * 1024 * 1024) {
        throw new Error("Los recursos superan 100 MiB.");
      }
      assets.push({
        originalName: asset.originalName,
        relativePath: reusable.relativePath,
        pathname: reusable.pathname,
        url: reusable.url,
        contentType: reusable.contentType,
        size: reusable.size,
        sha256: reusable.sha256,
      });
      continue;
    }
    let stored: Awaited<ReturnType<typeof head>>;
    try {
      stored = await head(asset.pathname, blobAuthOptions());
    } catch (cause) {
      console.error("[content-management] uploaded asset lookup failed", {
        pathname: asset.pathname,
        cause,
      });
      throw invalidUploadedAsset(cause);
    }
    if (
      stored.size !== asset.size ||
      stored.contentType !== asset.contentType
    ) {
      console.error("[content-management] uploaded asset metadata mismatch", {
        pathname: asset.pathname,
        expectedSize: asset.size,
        actualSize: stored.size,
        expectedContentType: asset.contentType,
        actualContentType: stored.contentType,
      });
      throw invalidUploadedAsset();
    }
    if (stored.url !== asset.url) {
      console.warn("[content-management] using canonical uploaded asset URL", {
        pathname: asset.pathname,
        submittedHost: hostname(asset.url),
        canonicalHost: hostname(stored.url),
      });
    }
    const response = await fetch(stored.url, { cache: "no-store" });
    if (!response.ok) {
      console.error("[content-management] uploaded asset download failed", {
        pathname: asset.pathname,
        status: response.status,
      });
      throw invalidUploadedAsset();
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if ((await sha256(bytes)) !== asset.sha256) {
      throw new ContentManagementError(
        "INVALID_INPUT",
        "Una imagen subida no coincide con el documento convertido. Vuelve a importar el archivo.",
      );
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
      url: stored.url,
      contentType: stored.contentType,
      size: stored.size,
      sha256: asset.sha256,
    });
  }
  assertReferencesExist(nestedReferences, assets);
  return assets;
}

function invalidUploadedAsset(cause?: unknown): ContentManagementError {
  return new ContentManagementError(
    "INVALID_INPUT",
    "No se pudo validar una imagen subida. Vuelve a importar el documento.",
    cause === undefined ? undefined : { cause },
  );
}

function hostname(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return "invalid";
  }
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
