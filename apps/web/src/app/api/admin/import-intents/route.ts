import { NextResponse } from "next/server";
import { z } from "zod";

import {
  contentPaths,
  createShortId,
  slugify,
} from "@/features/content-management/application/document-paths";
import {
  assertSameOrigin,
  requireAdminSession,
} from "@/features/content-management/server/admin-session";
import { apiError } from "@/features/content-management/server/http";
import { signImportIntent } from "@/features/content-management/server/import-intent";

const schema = z.object({
  originalFileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine(
      (name) => name.toLowerCase().endsWith(".docx"),
      "Debe ser un archivo .docx",
    ),
  assets: z
    .array(
      z.object({
        index: z.number().int().min(0).max(99),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        extension: z.string().regex(/^[a-z0-9]+$/),
        contentType: z.string().regex(/^image\//),
      }),
    )
    .max(100),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireAdminSession();
    const input = schema.parse(await request.json());
    const id = createShortId();
    const slug = slugify(input.originalFileName);
    const folder = contentPaths.documentFolder(slug, id);
    const intentToken = await signImportIntent({
      id,
      slug,
      folder,
      originalFileName: input.originalFileName,
    });
    const assets = input.assets.map((asset) => {
      const name = `${String(asset.index + 1).padStart(3, "0")}-${asset.sha256.slice(0, 16)}.${asset.extension}`;
      return {
        index: asset.index,
        pathname: contentPaths.image(folder, name),
        placeholder: `__DOCX_ASSET_${asset.index}__`,
      };
    });
    return NextResponse.json({ id, slug, folder, intentToken, assets });
  } catch (error) {
    return apiError(error);
  }
}
