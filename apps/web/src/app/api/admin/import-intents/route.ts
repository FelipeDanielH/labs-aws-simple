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
import { getCachedAdminDocumentByCanonicalKey } from "@/features/content-management/server/cached-content";

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
    existingDocumentId: z.string().min(1).optional(),
    expectedEtag: z.string().min(1).optional(),
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
    const existing = await getCachedAdminDocumentByCanonicalKey(canonicalKey);
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
    const canonicalKey = canonicalDocumentKey(input.originalFileName);
    const existing = await getCachedAdminDocumentByCanonicalKey(canonicalKey);
    if (existing && existing.manifest.id !== input.existingDocumentId) {
      return NextResponse.json(
        {
          error: "Ya existe un laboratorio asociado a ese archivo.",
          existingDocumentId: existing.manifest.id,
        },
        { status: 409 },
      );
    }
    if (
      input.existingDocumentId &&
      (!existing ||
        existing.etag !== input.expectedEtag ||
        existing.manifest.id !== input.existingDocumentId)
    ) {
      return NextResponse.json(
        { error: "El laboratorio cambió; vuelve a abrir la importación." },
        { status: 409 },
      );
    }
    const id = existing?.manifest.id ?? createShortId();
    const slug = existing?.manifest.slug ?? slugify(input.originalFileName);
    const folder =
      existing?.manifest.folder ?? contentPaths.documentFolder(slug, id);
    const assets = input.assets.map((asset) => {
      const requestedRelativePath =
        input.kind === "docx"
          ? `${existing ? `${createShortId()}-` : ""}${String(asset.index + 1).padStart(3, "0")}-${asset.sha256.slice(0, 16)}.${asset.extension}`
          : normalizeRelativeAssetPath(asset.relativePath);
      const reusable = existing?.manifest.assets.find(
        (candidate) =>
          candidate.sha256 === asset.sha256 &&
          candidate.size === asset.size &&
          candidate.contentType === asset.contentType &&
          (input.kind === "docx" ||
            candidate.relativePath === requestedRelativePath),
      );
      if (reusable) {
        return {
          index: asset.index,
          mode: "reuse" as const,
          relativePath: reusable.relativePath,
          pathname: reusable.pathname,
          placeholder:
            input.kind === "docx" ? `__DOCX_ASSET_${asset.index}__` : null,
          reuse: {
            pathname: reusable.pathname,
            url: reusable.url,
            relativePath: reusable.relativePath,
            contentType: reusable.contentType,
            size: reusable.size,
            sha256: reusable.sha256,
          },
        };
      }
      return {
        index: asset.index,
        mode: "upload" as const,
        relativePath: requestedRelativePath,
        pathname:
          input.kind === "docx"
            ? contentPaths.image(folder, requestedRelativePath)
            : contentPaths.asset(folder, requestedRelativePath),
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
      allowedPathnames: assets
        .filter((asset) => asset.mode === "upload")
        .map((asset) => asset.pathname),
      reusableAssets: assets.flatMap((asset) =>
        asset.mode === "reuse" ? [asset.reuse] : [],
      ),
      replaceEtag: existing?.etag,
    });
    return NextResponse.json({ id, slug, folder, intentToken, assets });
  } catch (error) {
    return apiError(error);
  }
}
