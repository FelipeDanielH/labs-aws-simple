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
    const subcategoryIds = new Set(
      taxonomy.categories.flatMap((item) =>
        item.subcategories.map((subcategory) => subcategory.id),
      ),
    );
    for (const { manifest: document } of documents) {
      const category = document.categoryId
        ? taxonomy.categories.find((item) => item.id === document.categoryId)
        : null;
      if (document.categoryId && !category) {
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
      if (document.localizations.en?.status === "published") {
        if (category && !category.localizations.en) {
          throw new Error(
            "No se puede retirar la traducción de una categoría usada por contenido inglés publicado.",
          );
        }
        const subcategory = category?.subcategories.find(
          (item) => item.id === document.subcategoryId,
        );
        if (subcategory && !subcategory.localizations.en) {
          throw new Error(
            "No se puede retirar la traducción de una subcategoría usada por contenido inglés publicado.",
          );
        }
      }
    }
    return NextResponse.json(
      await getContentRepository().save(taxonomy, body.expectedEtag),
    );
  } catch (error) {
    return apiError(error);
  }
}
