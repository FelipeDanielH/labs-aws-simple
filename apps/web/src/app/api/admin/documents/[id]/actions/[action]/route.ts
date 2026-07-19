import { NextResponse } from "next/server";
import { z } from "zod";

import { ContentManagementError } from "@/features/content-management/domain/errors";
import {
  contentLocales,
  type DocumentStatus,
} from "@/features/content-management/domain/models";
import {
  assertSameOrigin,
  requireAdminSession,
} from "@/features/content-management/server/admin-session";
import { getContentRepository } from "@/features/content-management/server/container";
import { apiError } from "@/features/content-management/server/http";
import { getCachedAdminDocument } from "@/features/content-management/server/cached-content";
import { invalidateManifestChange } from "@/features/content-management/server/content-cache-invalidation";

type Context = { params: Promise<{ id: string; action: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    await requireAdminSession();
    const { id, action } = await context.params;
    const repository = getContentRepository();
    const previous = await getCachedAdminDocument(id);
    if (!previous) {
      throw new ContentManagementError("NOT_FOUND", "Documento no encontrado.");
    }
    if (action === "purge") {
      await repository.purge(id);
      invalidateManifestChange(previous.manifest, null);
      return NextResponse.json({ ok: true });
    }
    const { expectedEtag, locale, locales } = z
      .object({
        expectedEtag: z.string().min(1),
        locale: z.enum(contentLocales).default("es"),
        locales: z.array(z.enum(contentLocales)).min(1).optional(),
      })
      .parse(await request.json());
    if (action === "cleanup") {
      return NextResponse.json(
        await repository.cleanupVersions(id, expectedEtag),
      );
    }
    if (action === "publish") {
      const document = await repository.publishAvailable(id, expectedEtag);
      invalidateManifestChange(previous.manifest, document.manifest);
      return NextResponse.json(document);
    }
    if (action === "unpublish" && locales) {
      const document = await repository.unpublishSelected(
        id,
        locales,
        expectedEtag,
      );
      invalidateManifestChange(previous.manifest, document.manifest);
      return NextResponse.json(document);
    }
    const target: Record<string, DocumentStatus> = {
      unpublish: "draft",
      restore: "draft",
    };
    const status = target[action];
    if (!status) {
      throw new ContentManagementError("INVALID_INPUT", "Acción no válida.");
    }
    const document = await repository.transition(
      id,
      status,
      expectedEtag,
      locale,
    );
    invalidateManifestChange(previous.manifest, document.manifest);
    return NextResponse.json(document);
  } catch (error) {
    return apiError(error);
  }
}
