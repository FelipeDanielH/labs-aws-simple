"use client";

import { useState } from "react";

import { adminRequest } from "@/features/content-management/presentation/admin-api";

type MigrationMode = "dry-run" | "apply" | "verify";

type MigrationResult = {
  mode: MigrationMode;
  inspected: number;
  migrated: number;
  alreadyMigrated: number;
  locatorsMissing: number;
  locatorsCreated: number;
  locatorsVerified: number;
  taxonomy: "unchanged" | "pending" | "migrated" | "verified";
  errors: string[];
};

const labels: Record<MigrationMode, string> = {
  "dry-run": "Analizar migración",
  apply: "Aplicar migración",
  verify: "Verificar migración",
};
const migrationModes = ["dry-run", "apply", "verify"] as const;

export function MigrationControls() {
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [running, setRunning] = useState<MigrationMode | null>(null);
  const [confirmingApply, setConfirmingApply] = useState(false);
  const [error, setError] = useState("");

  async function run(mode: MigrationMode) {
    if (mode === "apply" && !confirmingApply) {
      setConfirmingApply(true);
      return;
    }

    setConfirmingApply(false);
    setRunning(mode);
    setError("");
    try {
      setResult(
        await adminRequest<MigrationResult>(
          "/api/admin/migrations/multilingual",
          {
            method: "POST",
            body: JSON.stringify({ mode }),
          },
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "La migración no pudo completarse.",
      );
    } finally {
      setRunning(null);
    }
  }

  return (
    <section
      aria-labelledby="migration-title"
      className="space-y-5 rounded-2xl border border-border bg-card p-6"
    >
      <div className="space-y-2">
        <h2 id="migration-title" className="text-2xl font-semibold">
          Migración de localizadores Blob
        </h2>
        <p className="text-sm text-muted-foreground">
          Analiza primero, aplica sólo con margen suficiente y verifica al
          terminar.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {migrationModes.map((mode) => (
          <button
            key={mode}
            type="button"
            className={
              mode === "apply"
                ? "button-danger disabled:opacity-60"
                : "button-secondary disabled:opacity-60"
            }
            disabled={
              running !== null ||
              (mode === "apply" &&
                (result?.mode !== "dry-run" || result.errors.length > 0))
            }
            onClick={() => void run(mode)}
          >
            {running === mode
              ? "Procesando…"
              : mode === "apply" && confirmingApply
                ? "Confirmar aplicación"
                : labels[mode]}
          </button>
        ))}
      </div>

      {confirmingApply ? (
        <p role="status" className="text-sm text-muted-foreground">
          Confirma para crear localizadores y reconstruir los catálogos.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {result ? (
        <div
          aria-live="polite"
          className="grid gap-2 rounded-xl bg-muted/50 p-4 text-sm sm:grid-cols-2"
        >
          <p>
            <strong>Modo:</strong> {result.mode}
          </p>
          <p>
            <strong>Manifiestos:</strong> {result.inspected}
          </p>
          <p>
            <strong>Migrados:</strong> {result.migrated}
          </p>
          <p>
            <strong>Ya migrados:</strong> {result.alreadyMigrated}
          </p>
          <p>
            <strong>Localizadores faltantes:</strong>{" "}
            {result.locatorsMissing}
          </p>
          <p>
            <strong>Localizadores creados:</strong>{" "}
            {result.locatorsCreated}
          </p>
          <p>
            <strong>Localizadores verificados:</strong>{" "}
            {result.locatorsVerified}
          </p>
          <p>
            <strong>Taxonomía:</strong> {result.taxonomy}
          </p>
          <p className="sm:col-span-2">
            <strong>Margen mínimo recomendado:</strong>{" "}
            {result.locatorsMissing + 20} operaciones avanzadas disponibles
          </p>
          <p className="sm:col-span-2">
            <strong>Errores:</strong>{" "}
            {result.errors.length ? result.errors.join(" · ") : "ninguno"}
          </p>
        </div>
      ) : null}
    </section>
  );
}
