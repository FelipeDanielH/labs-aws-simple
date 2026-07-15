"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { adminRequest } from "@/features/content-management/presentation/admin-api";

export function AdminLoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await adminRequest("/api/admin/auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      router.replace("/admin");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible iniciar sesión.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-6 shadow-sm"
    >
      <div>
        <h1 className="text-2xl font-semibold">Administración</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ingresa la contraseña configurada para administrar los laboratorios.
        </p>
      </div>
      <label className="block space-y-2 text-sm font-medium">
        Contraseña
        <input
          type="password"
          required
          minLength={12}
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-lg border bg-background px-3 py-2"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60"
      >
        {loading ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
