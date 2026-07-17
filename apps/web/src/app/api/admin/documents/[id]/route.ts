import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ContentManagementError } from "@/features/content-management/domain/errors";
import { processHtmlContent } from "@/features/content-management/application/html-content";
import {
  assertSafeMarkdownUrls,
  markdownLocalAssetReferences,
} from "@/features/content-management/application/markdown-content";
import { updateDocumentSchema } from "@/features/content-management/infrastructure/validation/schemas";
import {
  assertSameOrigin,
  requireAdminSession,
} from "@/features/content-management/server/admin-session";
import { getContentRepository } from "@/features/content-management/server/container";
import { apiError } from "@/features/content-management/server/http";
import { assertTaxonomySelection } from "@/features/content-management/server/taxonomy-selection";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    await requireAdminSession();
    const { id } = await context.params;
    const document = await getContentRepository().findById(id);
    if (!document)
      throw new ContentManagementError("NOT_FOUND", "Documento no encontrado.");
    return NextResponse.json(document);
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    await requireAdminSession();
    const { id } = await context.params;
    const input = updateDocumentSchema.parse(await request.json());
    const repository = getContentRepository();
    const { taxonomy } = await repository.get();
    assertTaxonomySelection(taxonomy, input.categoryId, input.subcategoryId);
    const current = await repository.findById(id);
    if (!current)
      throw new ContentManagementError("NOT_FOUND", "Documento no encontrado.");
    const existing = current.manifest.localizations[input.locale];
    const kind = input.contentKind ?? existing?.content.kind;
    if (kind === "markdown") {
      assertSafeMarkdownUrls(input.source);
      assertExistingReferences(
        markdownLocalAssetReferences(input.source),
        current.manifest.assets.map((asset) => asset.relativePath),
      );
    } else {
      const processed = processHtmlContent(input.source);
      assertExistingReferences(
        processed.localReferences,
        current.manifest.assets.map((asset) => asset.relativePath),
      );
    }
    const document = await repository.update(id, {
      ...input,
      source:
        kind === "html" ? processHtmlContent(input.source).html : input.source,
    });
    revalidatePath("/es/laboratorios");
    revalidatePath("/en/laboratorios");
    return NextResponse.json(document);
  } catch (error) {
    return apiError(error);
  }
}

function assertExistingReferences(references: string[], assets: string[]) {
  const available = new Set(assets);
  const missing = references.filter((reference) => !available.has(reference));
  if (missing.length) {
    throw new Error(
      `Faltan recursos locales: ${missing.slice(0, 5).join(", ")}`,
    );
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    await requireAdminSession();
    const { id } = await context.params;
    const { expectedEtag, locale } = z
      .object({
        expectedEtag: z.string().min(1),
        locale: z.enum(["es", "en"]).optional(),
      })
      .parse(await request.json());
    const repository = getContentRepository();
    const document =
      locale === "en"
        ? await repository.removeLocale(id, locale, expectedEtag)
        : await repository.transition(id, "trashed", expectedEtag, "es");
    revalidatePath("/es/laboratorios");
    revalidatePath("/en/laboratorios");
    return NextResponse.json(document);
  } catch (error) {
    return apiError(error);
  }
}
