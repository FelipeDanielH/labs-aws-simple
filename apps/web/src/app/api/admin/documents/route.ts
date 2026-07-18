import { NextResponse } from "next/server";

import {
  slugify,
} from "@/features/content-management/application/document-paths";
import {
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
import { validateUploadedAssets } from "@/features/content-management/server/uploaded-asset-validation";

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
