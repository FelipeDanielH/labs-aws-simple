import { NextResponse } from "next/server";
import { z } from "zod";

import {
  assertSameOrigin,
  requireAdminSession,
} from "@/features/content-management/server/admin-session";
import { getContentRepository } from "@/features/content-management/server/container";
import { apiError } from "@/features/content-management/server/http";
import { invalidateAllContentCaches } from "@/features/content-management/server/content-cache-invalidation";

const schema = z.object({
  mode: z.enum(["dry-run", "apply", "verify"]),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireAdminSession();
    const { mode } = schema.parse(await request.json());
    const result = await getContentRepository().migrate(mode);
    if (mode === "apply") invalidateAllContentCaches();
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
