"use client";

import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type {
  CatalogEntry,
  Taxonomy,
} from "@/features/content-management/domain/models";
import { messages } from "@/shared/config/translations";
import { usePreferencesStore } from "@/shared/store/preferences-store";

export function LaboratoriesContent({
  documents,
  taxonomy,
}: {
  documents: CatalogEntry[];
  taxonomy: Taxonomy;
}) {
  const locale = usePreferencesStore((state) => state.locale);
  const copy = messages[locale].laboratoriesPage;
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const category = taxonomy.categories.find((item) => item.id === categoryId);
  const visible = documents.filter(
    (document) =>
      (!categoryId || document.categoryId === categoryId) &&
      (!subcategoryId || document.subcategoryId === subcategoryId),
  );

  return (
    <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-6xl px-6 py-12 sm:py-16">
      <section className="space-y-10" aria-labelledby="laboratories-title">
        <div className="max-w-3xl space-y-3">
          <p className="text-sm font-medium text-primary">{copy.eyebrow}</p>
          <h1
            id="laboratories-title"
            className="text-4xl font-semibold tracking-tight sm:text-5xl"
          >
            {copy.title}
          </h1>
          <p className="text-lg text-muted-foreground">{copy.description}</p>
        </div>
        {taxonomy.categories.length ? (
          <div className="flex flex-wrap gap-3 rounded-xl border bg-card p-4">
            <select
              value={categoryId}
              onChange={(event) => {
                setCategoryId(event.target.value);
                setSubcategoryId("");
              }}
              className="rounded-lg border bg-background px-3 py-2"
            >
              <option value="">Todas las categorías</option>
              {taxonomy.categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              value={subcategoryId}
              disabled={!category}
              onChange={(event) => setSubcategoryId(event.target.value)}
              className="rounded-lg border bg-background px-3 py-2"
            >
              <option value="">Todas las subcategorías</option>
              {category?.subcategories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {visible.length ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {visible.map((document) => (
              <Link
                key={document.id}
                href={`/laboratorios/${document.slug}`}
                className="rounded-2xl border bg-card p-5 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-primary">
                  {categoryName(taxonomy, document.categoryId)}
                </p>
                <h2 className="mt-2 text-xl font-semibold">
                  {document.metadata.title}
                </h2>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                  {document.metadata.summary || "Documento de laboratorio"}
                </p>
                {document.metadata.tags.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {document.metadata.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-muted px-2 py-1 text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 px-6 text-center">
            <FlaskConical
              aria-hidden="true"
              className="mb-4 size-9 text-primary"
            />
            <h2 className="text-lg font-semibold">{copy.emptyTitle}</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              {copy.emptyDescription}
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

function categoryName(taxonomy: Taxonomy, id: string | null) {
  return (
    taxonomy.categories.find((category) => category.id === id)?.name ??
    "Laboratorio"
  );
}
