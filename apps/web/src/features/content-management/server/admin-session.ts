import "server-only";

import { compare } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

import { ContentManagementError } from "../domain/errors";

const COOKIE_NAME = "aws-labs-admin";
const SESSION_SECONDS = 8 * 60 * 60;

function sessionSecret(): Uint8Array {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new ContentManagementError(
      "NOT_CONFIGURED",
      "ADMIN_SESSION_SECRET debe tener al menos 32 caracteres.",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) {
    throw new ContentManagementError(
      "NOT_CONFIGURED",
      "ADMIN_PASSWORD_HASH no está configurado.",
    );
  }
  return compare(password, hash);
}

export async function createAdminSession(): Promise<void> {
  const token = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .setSubject("single-admin")
    .sign(sessionSecret());
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function destroyAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function hasAdminSession(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return false;
  try {
    const verified = await jwtVerify(token, sessionSecret(), {
      algorithms: ["HS256"],
      subject: "single-admin",
    });
    return verified.payload.role === "admin";
  } catch {
    return false;
  }
}

export async function requireAdminSession(): Promise<void> {
  if (!(await hasAdminSession())) {
    throw new ContentManagementError("UNAUTHORIZED", "Sesión no válida.");
  }
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const expected = new URL(request.url).origin;
  if (origin !== expected) {
    throw new ContentManagementError("UNAUTHORIZED", "Origen no permitido.");
  }
}
