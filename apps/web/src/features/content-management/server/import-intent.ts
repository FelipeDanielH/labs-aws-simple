import "server-only";

import { SignJWT, jwtVerify } from "jose";

import { ContentManagementError } from "../domain/errors";

export type ImportIntent = {
  id: string;
  slug: string;
  folder: string;
  originalFileName: string;
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
    .setSubject("docx-import")
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(secret());
}

export async function verifyImportIntent(token: string): Promise<ImportIntent> {
  try {
    const result = await jwtVerify(token, secret(), {
      algorithms: ["HS256"],
      subject: "docx-import",
    });
    const payload = result.payload;
    if (
      typeof payload.id !== "string" ||
      typeof payload.slug !== "string" ||
      typeof payload.folder !== "string" ||
      typeof payload.originalFileName !== "string"
    ) {
      throw new Error("Invalid payload");
    }
    return {
      id: payload.id,
      slug: payload.slug,
      folder: payload.folder,
      originalFileName: payload.originalFileName,
    };
  } catch (cause) {
    throw new ContentManagementError(
      "UNAUTHORIZED",
      "El intento de importación expiró o no es válido.",
      { cause },
    );
  }
}
