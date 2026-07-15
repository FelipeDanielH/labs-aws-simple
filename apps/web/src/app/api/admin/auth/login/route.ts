import { NextResponse } from "next/server";
import { z } from "zod";

import {
  assertSameOrigin,
  createAdminSession,
  verifyAdminPassword,
} from "@/features/content-management/server/admin-session";
import { apiError } from "@/features/content-management/server/http";

const schema = z.object({ password: z.string().min(12).max(512) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { password } = schema.parse(await request.json());
    if (!(await verifyAdminPassword(password))) {
      return NextResponse.json(
        { error: "Credenciales no válidas." },
        { status: 401 },
      );
    }
    await createAdminSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
