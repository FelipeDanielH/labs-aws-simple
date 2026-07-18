import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  assertSafeMarkdownUrls,
  markdownLocalAssetReferences,
} from "@/features/content-management/application/markdown-content";
import { processHtmlContent } from "@/features/content-management/application/html-content";
import type {
  UploadedAssetInput,
  VersionedDocument,
} from "@/features/content-management/domain/models";
import {
  localizedMetadataSchema,
  uploadedAssetSchema,
} from "@/features/content-management/infrastructure/validation/schemas";
import {
  assertSameOrigin,
  requireAdminSession,
} from "@/features/content-management/server/admin-session";
import { getContentRepository } from "@/features/content-management/server/container";
import { apiError } from "@/features/content-management/server/http";
import { verifyImportIntent } from "@/features/content-management/server/import-intent";
import { assertTaxonomySelection } from "@/features/content-management/server/taxonomy-selection";
import { validateUploadedAssets } from "@/features/content-management/server/uploaded-asset-validation";

type Context = { params: Promise<{ id: string }> };

const schema = z.object({
  intentToken: z.string().min(1),
  source: z.string().max(2 * 1024 * 1024),
  metadata: localizedMetadataSchema,
  assets: z.array(uploadedAssetSchema).max(200),
  order: z.number().int().nullable(),
  categoryId: z.string().nullable(),
  subcategoryId: z.string().nullable(),
  expectedEtag: z.string().min(1),
});

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    await requireAdminSession();
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const intent = await verifyImportIntent(input.intentToken);
    if (
      intent.kind !== "docx" ||
      intent.id !== id ||
      intent.replaceEtag !== input.expectedEtag
    ) {
      throw new Error("La reimportación no coincide con el documento.");
    }

    const repository = getContentRepository();
    const current = await repository.findById(id);
    if (!current) throw new Error("Documento no encontrado.");
    const { taxonomy } = await repository.get();
    assertTaxonomySelection(taxonomy, input.categoryId, input.subcategoryId);
    const assets = await validateUploadedAssets(
      input.assets,
      intent.allowedPathnames,
    );
    let source = input.source;
    for (const asset of input.assets) {
      if (asset.placeholder) {
        source = source.replaceAll(
          asset.placeholder,
          `./images/${asset.pathname.split("/").at(-1)}`,
        );
      }
    }
    if (/__DOCX_ASSET_\d+__/.test(source)) {
      throw new Error("Faltan imágenes de la reimportación.");
    }
    assertSafeMarkdownUrls(source);
    assertReferencesExist(markdownLocalAssetReferences(source), assets);

    const retainedAssets = assetsReferencedByEnglish(current);
    const document = await repository.replace(id, {
      locale: "es",
      originalFileName: intent.originalFileName,
      contentKind: "markdown",
      source,
      metadata: input.metadata,
      assets: [
        ...assets,
        ...retainedAssets.filter(
          (retained) =>
            !assets.some((asset) => asset.pathname === retained.pathname),
        ),
      ],
      order: input.order,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      expectedEtag: input.expectedEtag,
    });
    revalidatePath("/es/laboratorios");
    revalidatePath("/en/laboratorios");
    return NextResponse.json(document);
  } catch (error) {
    return apiError(error);
  }
}

function assetsReferencedByEnglish(
  document: VersionedDocument | null,
): UploadedAssetInput[] {
  const english = document?.manifest.localizations.en;
  const source = document?.sources.en;
  if (!english || !source) return [];
  const references =
    english.content.kind === "html"
      ? processHtmlContent(source).localReferences
      : markdownLocalAssetReferences(source);
  const referenced = new Set(references);
  return document.manifest.assets
    .filter((asset) => referenced.has(asset.relativePath))
    .map(({ id: _id, ...asset }) => asset);
}

function assertReferencesExist(
  references: string[],
  assets: UploadedAssetInput[],
) {
  const available = new Set(assets.map((asset) => asset.relativePath));
  const missing = references.filter((reference) => !available.has(reference));
  if (missing.length) {
    throw new Error(
      `Faltan recursos locales: ${missing.slice(0, 5).join(", ")}`,
    );
  }
}
