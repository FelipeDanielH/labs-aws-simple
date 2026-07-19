import { NextResponse } from "next/server";

import {
  assertSameOrigin,
  requireAdminSession,
} from "@/features/content-management/server/admin-session";
import { getContentRepository } from "@/features/content-management/server/container";
import { apiError } from "@/features/content-management/server/http";
import { invalidateCatalogCache } from "@/features/content-management/server/content-cache-invalidation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireAdminSession();
    const catalog = await getContentRepository().rebuildPublicCatalog();
    invalidateCatalogCache("es");
    return NextResponse.json(catalog);
  } catch (error) {
    return apiError(error);
  }
}
