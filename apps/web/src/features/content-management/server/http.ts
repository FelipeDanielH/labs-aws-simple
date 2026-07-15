import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { ContentManagementError } from "../domain/errors";

export function apiError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Datos inválidos.", issues: error.issues },
      { status: 400 },
    );
  }
  if (error instanceof ContentManagementError) {
    const status = {
      UNAUTHORIZED: 401,
      NOT_FOUND: 404,
      CONFLICT: 409,
      INVALID_INPUT: 400,
      NOT_CONFIGURED: 503,
      STORAGE_FAILURE: 502,
    }[error.code];
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status },
    );
  }
  console.error(error);
  return NextResponse.json(
    { error: "Error interno inesperado." },
    { status: 500 },
  );
}
