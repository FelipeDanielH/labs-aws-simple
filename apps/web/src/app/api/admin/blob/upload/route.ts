import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { assertSafeBlobPath } from "@/features/content-management/application/document-paths";
import { requireAdminSession } from "@/features/content-management/server/admin-session";
import { apiError } from "@/features/content-management/server/http";
import { verifyImportIntent } from "@/features/content-management/server/import-intent";

const ALLOWED_IMAGES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/avif",
];
const ALLOWED_HTML_ASSETS = [
  ...ALLOWED_IMAGES,
  "text/css",
  "font/woff",
  "font/woff2",
  "font/ttf",
  "font/otf",
  "application/font-woff",
  "application/font-sfnt",
];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        await requireAdminSession();
        const intent = await verifyImportIntent(clientPayload ?? "");
        assertSafeBlobPath(pathname);
        if (!intent.allowedPathnames.includes(pathname)) {
          throw new Error("El recurso no pertenece al documento reservado.");
        }
        return {
          allowedContentTypes:
            intent.kind === "html" ? ALLOWED_HTML_ASSETS : ALLOWED_IMAGES,
          maximumSizeInBytes: 25 * 1024 * 1024,
          cacheControlMaxAge: 31_536_000,
          addRandomSuffix: false,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({ documentId: intent.id }),
        };
      },
      onUploadCompleted: async () => undefined,
    });
    return NextResponse.json(response);
  } catch (error) {
    return apiError(error);
  }
}
