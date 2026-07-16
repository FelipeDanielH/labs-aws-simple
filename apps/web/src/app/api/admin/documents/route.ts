import { NextResponse } from "next/server";
import { head } from "@vercel/blob";

import {
  assertSafeBlobPath,
  resolveRelativeAssetPath,
} from "@/features/content-management/application/document-paths";
import {
  collectCssReferences,
  processHtmlContent,
} from "@/features/content-management/application/html-content";
import {
  assertSafeMarkdownUrls,
  markdownLocalAssetReferences,
} from "@/features/content-management/application/markdown-content";
import { assertAssetSignature } from "@/features/content-management/application/asset-validation";
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
    const documents = await getContentRepository().list(validStatus);
    return NextResponse.json({ documents });
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
    if (intent.originalFileName !== input.originalFileName) {
      throw new Error("El archivo no coincide con el intento de importación.");
    }
    if (intent.kind !== input.contentKind) {
      throw new Error("El tipo de contenido no coincide con la importación.");
    }
    const repository = getContentRepository();
    const { taxonomy } = await repository.get();
    assertTaxonomySelection(taxonomy, input.categoryId, input.subcategoryId);

    let source = input.source;
    let totalSize = 0;
    const nestedAssetReferences: string[] = [];
    const assets: UploadedAssetInput[] = [];
    for (const asset of input.assets) {
      assertSafeBlobPath(asset.pathname);
      if (!intent.allowedPathnames.includes(asset.pathname)) {
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
      const signatureResponse = await fetch(stored.url, {
        cache: "no-store",
        headers:
          stored.contentType === "text/css"
            ? undefined
            : { Range: "bytes=0-4095" },
      });
      if (!signatureResponse.ok)
        throw new Error("No se pudo validar un recurso subido.");
      const signatureBytes = new Uint8Array(
        await signatureResponse.arrayBuffer(),
      );
      assertAssetSignature(
        signatureBytes,
        stored.contentType,
        asset.originalName,
      );
      if (stored.contentType === "text/css") {
        const css = new TextDecoder("utf-8", { fatal: true }).decode(
          signatureBytes,
        );
        for (const reference of collectCssReferences(css, new Set(), true)) {
          nestedAssetReferences.push(
            resolveRelativeAssetPath(
              asset.relativePath,
              reference.split(/[?#]/u)[0],
            ),
          );
        }
      }
      totalSize += stored.size;
      if (totalSize > 100 * 1024 * 1024)
        throw new Error("Los recursos superan 100 MiB.");
      if (asset.placeholder) {
        source = source.replaceAll(
          asset.placeholder,
          `./images/${asset.pathname.split("/").at(-1)}`,
        );
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
    if (/__DOCX_ASSET_\d+__/.test(source)) {
      throw new Error("Faltan imágenes por subir.");
    }
    if (input.contentKind === "html") {
      const processed = processHtmlContent(source);
      assertReferencesExist(
        [...processed.localReferences, ...nestedAssetReferences],
        assets,
      );
      source = processed.html;
    } else {
      assertSafeMarkdownUrls(source);
      assertReferencesExist(markdownLocalAssetReferences(source), assets);
    }
    const document = await repository.create({
      id: intent.id,
      slug: intent.slug,
      folder: intent.folder,
      originalFileName: input.originalFileName,
      contentKind: input.contentKind === "html" ? "html" : "markdown",
      source,
      assets,
      metadata: input.metadata,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
    });
    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
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
