import "server-only";

import { SignJWT, jwtVerify } from "jose";

import { ContentManagementError } from "../domain/errors";

export type ImportIntent = {
  kind: "docx" | "markdown" | "html";
  id: string;
  slug: string;
  folder: string;
  canonicalKey: string;
  originalFileName: string;
  allowedPathnames: string[];
  replaceEtag?: string;
};

function secret(): Uint8Array {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new ContentManagementError(
      "NOT_CONFIGURED",
      "Falta ADMIN_SESSION_SECRET.",
    );
  }
  return new TextEncoder().encode(value);
}

export async function signImportIntent(intent: ImportIntent): Promise<string> {
  return new SignJWT(intent)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("content-import")
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(secret());
}

export async function verifyImportIntent(token: string): Promise<ImportIntent> {
  try {
    const result = await jwtVerify(token, secret(), {
      algorithms: ["HS256"],
      subject: "content-import",
    });
    const payload = result.payload;
    if (
      typeof payload.id !== "string" ||
      typeof payload.slug !== "string" ||
      typeof payload.folder !== "string" ||
      typeof payload.canonicalKey !== "string" ||
      typeof payload.originalFileName !== "string" ||
      (payload.kind !== "docx" &&
        payload.kind !== "markdown" &&
        payload.kind !== "html") ||
      !Array.isArray(payload.allowedPathnames) ||
      !payload.allowedPathnames.every((value) => typeof value === "string") ||
      (payload.replaceEtag !== undefined &&
        typeof payload.replaceEtag !== "string")
    ) {
      throw new Error("Invalid payload");
    }
    return {
      kind: payload.kind,
      id: payload.id,
      slug: payload.slug,
      folder: payload.folder,
      canonicalKey: payload.canonicalKey,
      originalFileName: payload.originalFileName,
      allowedPathnames: payload.allowedPathnames,
      replaceEtag: payload.replaceEtag,
    };
  } catch (cause) {
    throw new ContentManagementError(
      "UNAUTHORIZED",
      "El intento de importación expiró o no es válido.",
      { cause },
    );
  }
}
