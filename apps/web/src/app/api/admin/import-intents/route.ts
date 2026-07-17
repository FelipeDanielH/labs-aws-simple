import { NextResponse } from "next/server";
import { z } from "zod";

import {
  contentPaths,
  canonicalDocumentKey,
  createShortId,
  normalizeRelativeAssetPath,
  slugify,
} from "@/features/content-management/application/document-paths";
import {
  assertSameOrigin,
  requireAdminSession,
} from "@/features/content-management/server/admin-session";
import { apiError } from "@/features/content-management/server/http";
import { signImportIntent } from "@/features/content-management/server/import-intent";
import { getContentRepository } from "@/features/content-management/server/container";

const schema = z
  .object({
    kind: z.enum(["docx", "markdown", "html"]),
    originalFileName: z.string().trim().min(1).max(255),
    assets: z
      .array(
        z.object({
          index: z.number().int().min(0).max(199),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
          extension: z.string().regex(/^[a-z0-9]+$/),
          contentType: z.string().min(1).max(100),
          relativePath: z.string().min(1).max(1000),
          size: z
            .number()
            .int()
            .nonnegative()
            .max(25 * 1024 * 1024),
        }),
      )
      .max(200),
  })
  .superRefine((value, context) => {
    const extension =
      value.kind === "docx" ? ".docx" : value.kind === "html" ? ".html" : ".md";
    if (!value.originalFileName.toLowerCase().endsWith(extension)) {
      context.addIssue({
        code: "custom",
        path: ["originalFileName"],
        message: `Debe ser un archivo ${extension}`,
      });
    }
    if (
      value.assets.reduce((total, asset) => total + asset.size, 0) >
      100 * 1024 * 1024
    ) {
      context.addIssue({
        code: "custom",
        path: ["assets"],
        message: "Los recursos superan 100 MiB",
      });
    }
  });

export async function GET(request: Request) {
  try {
    await requireAdminSession();
    const fileName = new URL(request.url).searchParams.get("fileName");
    if (!fileName) {
      return NextResponse.json({ existingDocumentId: null });
    }
    const canonicalKey = canonicalDocumentKey(fileName);
    const existing = (await getContentRepository().list()).find(
      ({ manifest }) => manifest.canonicalKey === canonicalKey,
    );
    return NextResponse.json({
      existingDocumentId: existing?.manifest.id ?? null,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireAdminSession();
    const input = schema.parse(await request.json());
    const id = createShortId();
    const slug = slugify(input.originalFileName);
    const canonicalKey = canonicalDocumentKey(input.originalFileName);
    const existing = (await getContentRepository().list()).find(
      ({ manifest }) => manifest.canonicalKey === canonicalKey,
    );
    if (existing) {
      return NextResponse.json(
        {
          error: "Ya existe un laboratorio asociado a ese archivo.",
          existingDocumentId: existing.manifest.id,
        },
        { status: 409 },
      );
    }
    const folder = contentPaths.documentFolder(slug, id);
    const assets = input.assets.map((asset) => {
      const relativePath =
        input.kind === "docx"
          ? `${String(asset.index + 1).padStart(3, "0")}-${asset.sha256.slice(0, 16)}.${asset.extension}`
          : normalizeRelativeAssetPath(asset.relativePath);
      return {
        index: asset.index,
        relativePath,
        pathname:
          input.kind === "docx"
            ? contentPaths.image(folder, relativePath)
            : contentPaths.asset(folder, relativePath),
        placeholder:
          input.kind === "docx" ? `__DOCX_ASSET_${asset.index}__` : null,
      };
    });
    const intentToken = await signImportIntent({
      kind: input.kind,
      id,
      slug,
      folder,
      canonicalKey,
      originalFileName: input.originalFileName,
      allowedPathnames: assets.map((asset) => asset.pathname),
    });
    return NextResponse.json({ id, slug, folder, intentToken, assets });
  } catch (error) {
    return apiError(error);
  }
}
