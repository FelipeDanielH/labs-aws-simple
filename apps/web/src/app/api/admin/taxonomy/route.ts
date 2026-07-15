import { NextResponse } from "next/server";

import { taxonomySchema } from "@/features/content-management/infrastructure/validation/schemas";
import {
  assertSameOrigin,
  requireAdminSession,
} from "@/features/content-management/server/admin-session";
import { getContentRepository } from "@/features/content-management/server/container";
import { apiError } from "@/features/content-management/server/http";

export async function GET() {
  try {
    await requireAdminSession();
    return NextResponse.json(await getContentRepository().get());
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    await requireAdminSession();
    const body = (await request.json()) as {
      taxonomy: unknown;
      expectedEtag: string | null;
    };
    const taxonomy = taxonomySchema.parse(body.taxonomy);
    const documents = await getContentRepository().list();
    const categoryIds = new Set(taxonomy.categories.map((item) => item.id));
    const subcategoryIds = new Set(
      taxonomy.categories.flatMap((item) =>
        item.subcategories.map((subcategory) => subcategory.id),
      ),
    );
    for (const { manifest: document } of documents) {
      if (document.categoryId && !categoryIds.has(document.categoryId)) {
        throw new Error("No se puede eliminar una categoría que está en uso.");
      }
      if (
        document.subcategoryId &&
        !subcategoryIds.has(document.subcategoryId)
      ) {
        throw new Error(
          "No se puede eliminar una subcategoría que está en uso.",
        );
      }
    }
    return NextResponse.json(
      await getContentRepository().save(taxonomy, body.expectedEtag),
    );
  } catch (error) {
    return apiError(error);
  }
}
