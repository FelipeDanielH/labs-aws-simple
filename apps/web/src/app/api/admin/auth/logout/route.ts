import { NextResponse } from "next/server";

import {
  assertSameOrigin,
  destroyAdminSession,
} from "@/features/content-management/server/admin-session";
import { apiError } from "@/features/content-management/server/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await destroyAdminSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
