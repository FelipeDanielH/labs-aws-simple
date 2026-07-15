import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import {
  assertSameOrigin,
  requireAdminSession,
} from "@/features/content-management/server/admin-session";
import { getContentRepository } from "@/features/content-management/server/container";
import { apiError } from "@/features/content-management/server/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireAdminSession();
    const catalog = await getContentRepository().rebuildPublicCatalog();
    revalidatePath("/laboratorios");
    return NextResponse.json(catalog);
  } catch (error) {
    return apiError(error);
  }
}
