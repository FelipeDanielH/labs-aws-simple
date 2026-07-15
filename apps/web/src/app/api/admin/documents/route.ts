import { NextResponse } from "next/server";

import { assertSafeBlobPath } from "@/features/content-management/application/document-paths";
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
    const repository = getContentRepository();
    const { taxonomy } = await repository.get();
    assertTaxonomySelection(taxonomy, input.categoryId, input.subcategoryId);

    let markdown = input.markdown;
    const assets: UploadedAssetInput[] = input.assets.map((asset) => {
      assertSafeBlobPath(asset.pathname);
      if (!asset.pathname.startsWith(`${intent.folder}/images/`)) {
        throw new Error("Una imagen no pertenece al documento.");
      }
      markdown = markdown.replaceAll(
        asset.placeholder,
        `./images/${asset.pathname.split("/").at(-1)}`,
      );
      return {
        originalName: asset.originalName,
        pathname: asset.pathname,
        url: asset.url,
        contentType: asset.contentType,
        size: asset.size,
        sha256: asset.sha256,
      };
    });
    if (/__DOCX_ASSET_\d+__/.test(markdown)) {
      throw new Error("Faltan imágenes por subir.");
    }
    const document = await repository.create({
      id: intent.id,
      slug: intent.slug,
      folder: intent.folder,
      originalFileName: input.originalFileName,
      markdown,
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
