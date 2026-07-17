import { NextResponse } from "next/server";
import { z } from "zod";

import {
  assertSameOrigin,
  requireAdminSession,
} from "@/features/content-management/server/admin-session";
import { getContentRepository } from "@/features/content-management/server/container";
import { apiError } from "@/features/content-management/server/http";

const schema = z.object({
  mode: z.enum(["dry-run", "apply", "verify"]),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireAdminSession();
    const { mode } = schema.parse(await request.json());
    return NextResponse.json(await getContentRepository().migrate(mode));
  } catch (error) {
    return apiError(error);
  }
}
