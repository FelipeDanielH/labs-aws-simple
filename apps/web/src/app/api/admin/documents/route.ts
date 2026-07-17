import { NextResponse } from "next/server";
import { head } from "@vercel/blob";

import {
  assertSafeBlobPath,
  resolveRelativeAssetPath,
  slugify,
} from "@/features/content-management/application/document-paths";
import { assertAssetSignature } from "@/features/content-management/application/asset-validation";
import {
  collectCssReferences,
  processHtmlContent,
} from "@/features/content-management/application/html-content";
import {
  assertSafeMarkdownUrls,
  markdownLocalAssetReferences,
} from "@/features/content-management/application/markdown-content";
import type { UploadedAssetInput } from "@/features/content-management/domain/models";
import { createDocumentSchema } from "@/features/content-management/infrastructure/validation/schemas";
import {
  assertSameOrigin,
  requireAdminSession,
} from "@/features/content-management/server/admin-session";
import { getContentRepository } from "@/features/content-management/server/container";
import { apiError } from "@/features/content-management/server/http";
import { verifyImportIntent } from "@/features/content-management/server/import-intent";
import { assertTaxonomySelection } from "@/features/content-management/server/taxonomy-selection";

export async function GET(request: Request) {
  try {
    await requireAdminSession();
    const status = new URL(request.url).searchParams.get("status") ?? undefined;
    const validStatus =
      status === "draft" || status === "published" || status === "trashed"
        ? status
        : undefined;
    return NextResponse.json({
      documents: await getContentRepository().list(validStatus),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireAdminSession();
    const input = createDocumentSchema.parse(await request.json());
    const intent = await verifyImportIntent(input.intentToken);
    const spanish = input.variants.find((variant) => variant.locale === "es")!;
    if (
      intent.originalFileName !== spanish.originalFileName ||
      intent.kind !== spanish.contentKind
    ) {
      throw new Error("El archivo español no coincide con la importación.");
    }

    const repository = getContentRepository();
    const { taxonomy } = await repository.get();
    assertTaxonomySelection(taxonomy, input.categoryId, input.subcategoryId);
    const assets = await validateUploadedAssets(
      input.assets,
      intent.allowedPathnames,
    );

    const variants = input.variants.map((variant) => {
      let source = variant.source;
      for (const asset of input.assets) {
        if (asset.placeholder) {
          source = source.replaceAll(
            asset.placeholder,
            `./images/${asset.pathname.split("/").at(-1)}`,
          );
        }
      }
      if (/__DOCX_ASSET_\d+__/.test(source)) {
        throw new Error(
          `Faltan imágenes compartidas en la versión ${variant.locale.toUpperCase()}.`,
        );
      }
      if (variant.contentKind === "html") {
        const processed = processHtmlContent(source);
        assertReferencesExist(processed.localReferences, assets);
        source = processed.html;
      } else {
        assertSafeMarkdownUrls(source);
        assertReferencesExist(markdownLocalAssetReferences(source), assets);
      }
      return {
        locale: variant.locale,
        slug: slugify(variant.originalFileName),
        originalFileName: variant.originalFileName,
        contentKind:
          variant.contentKind === "html"
            ? ("html" as const)
            : ("markdown" as const),
        source,
        metadata: variant.metadata,
      };
    });

    const document = await repository.create({
      id: intent.id,
      folder: intent.folder,
      canonicalKey: intent.canonicalKey,
      variants,
      assets,
      order: input.order,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
    });
    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

async function validateUploadedAssets(
  uploaded: Array<{
    index: number;
    placeholder: string | null;
    originalName: string;
    relativePath: string;
    pathname: string;
    url: string;
    contentType: string;
    size: number;
    sha256: string;
  }>,
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
    const response = await fetch(stored.url, {
      cache: "no-store",
    });
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
