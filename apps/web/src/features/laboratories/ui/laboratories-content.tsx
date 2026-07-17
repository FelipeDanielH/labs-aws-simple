"use client";

import {
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useState } from "react";

import type {
  CatalogEntry,
  Taxonomy,
} from "@/features/content-management/domain/models";
import { messages } from "@/shared/config/translations";

const PAGE_SIZE_OPTIONS = [15, 30, 50, 100] as const;

export function LaboratoriesContent({
  documents,
  taxonomy,
  locale,
}: {
  documents: CatalogEntry[];
  taxonomy: Taxonomy;
  locale: "es" | "en";
}) {
  const copy = messages[locale].laboratoriesPage;
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedSearchQuery = normalizeSearchValue(deferredSearchQuery);
  const categoryParam = searchParams.get("categoria");
  const subcategoryParam = searchParams.get("subcategoria");
  const category = taxonomy.categories.find(
    (item) => item.id === categoryParam || item.slug === categoryParam,
  );
  const subcategory = category?.subcategories.find(
    (item) => item.id === subcategoryParam || item.slug === subcategoryParam,
  );
  const categoryId = category?.id ?? "";
  const subcategoryId = subcategory?.id ?? "";
  const filteredDocuments = documents.filter(
    (document) =>
      (!categoryId || document.categoryId === categoryId) &&
      (!subcategoryId || document.subcategoryId === subcategoryId) &&
      (!normalizedSearchQuery ||
        normalizeSearchValue(document.metadata.title).includes(
          normalizedSearchQuery,
        )),
  );
  const pageSizeValue = Number(searchParams.get("porPagina"));
  const pageSize = PAGE_SIZE_OPTIONS.includes(
    pageSizeValue as (typeof PAGE_SIZE_OPTIONS)[number],
  )
    ? pageSizeValue
    : PAGE_SIZE_OPTIONS[0];
  const totalPages = Math.max(
    1,
    Math.ceil(filteredDocuments.length / pageSize),
  );
  const requestedPage = Number.parseInt(searchParams.get("pagina") ?? "1", 10);
  const currentPage = Number.isFinite(requestedPage)
    ? Math.min(Math.max(requestedPage, 1), totalPages)
    : 1;
  const pageStart = (currentPage - 1) * pageSize;
  const visibleDocuments = filteredDocuments.slice(
    pageStart,
    pageStart + pageSize,
  );
  const paginationItems = getPaginationItems(currentPage, totalPages);

  return (
    <main className="mx-auto min-h-[calc(100vh-4rem)] w-full max-w-[94rem] px-4 py-10 sm:px-6 sm:py-14">
      <section className="space-y-9" aria-labelledby="laboratories-title">
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

        <div className="grid items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-2xl border bg-card">
            <div className="border-b px-5 py-4">
              <h2 className="font-semibold">{copy.categoriesTitle}</h2>
            </div>
            <nav aria-label={copy.categoriesAriaLabel} className="p-3">
              <Link
                href={createCatalogHref()}
                aria-current={!category ? "page" : undefined}
                className={navigationLinkClass(!category)}
              >
                <span>{copy.allLaboratories}</span>
                <span className="text-muted-foreground">
                  ({documents.length})
                </span>
              </Link>

              <ul className="mt-1 space-y-1">
                {taxonomy.categories.map((item) => {
                  const isSelected = category?.id === item.id && !subcategory;
                  const categoryCount = documents.filter(
                    (document) => document.categoryId === item.id,
                  ).length;

                  return (
                    <li key={item.id}>
                      <Link
                        href={createCatalogHref(item.slug)}
                        aria-current={isSelected ? "page" : undefined}
                        className={navigationLinkClass(isSelected)}
                      >
                        <span>{item.name}</span>
                        <span className="text-muted-foreground">
                          ({categoryCount})
                        </span>
                      </Link>

                      {item.subcategories.length ? (
                        <ul className="my-1 ml-4 space-y-1 border-l pl-2">
                          {item.subcategories.map((child) => {
                            const isChildSelected =
                              subcategory?.id === child.id;
                            const childCount = documents.filter(
                              (document) => document.subcategoryId === child.id,
                            ).length;

                            return (
                              <li key={child.id}>
                                <Link
                                  href={createCatalogHref(
                                    item.slug,
                                    child.slug,
                                  )}
                                  aria-current={
                                    isChildSelected ? "page" : undefined
                                  }
                                  className={navigationLinkClass(
                                    isChildSelected,
                                    true,
                                  )}
                                >
                                  <span>{child.name}</span>
                                  <span className="text-muted-foreground">
                                    ({childCount})
                                  </span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>

          <div className="min-w-0 space-y-5">
            <section className="rounded-2xl border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xl font-semibold">
                  {category?.name ?? copy.allLaboratories}{" "}
                  <span aria-live="polite" className="text-muted-foreground">
                    ({filteredDocuments.length})
                  </span>
                </h2>
                {filteredDocuments.length ? (
                  <p className="text-sm text-muted-foreground">
                    {pageStart + 1}–
                    {Math.min(pageStart + pageSize, filteredDocuments.length)}{" "}
                    {copy.resultsConnector} {filteredDocuments.length}
                  </p>
                ) : null}
              </div>

              <div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-center">
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">{copy.searchLabel}</span>
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => {
                      setSearchQuery(event.target.value);
                      resetCurrentPage();
                    }}
                    autoComplete="off"
                    placeholder={copy.searchPlaceholder}
                    className="h-10 w-full rounded-lg border bg-background pr-10 pl-10 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      aria-label={copy.clearSearch}
                      onClick={() => {
                        setSearchQuery("");
                        resetCurrentPage();
                      }}
                      className="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X aria-hidden="true" className="size-4" />
                    </button>
                  ) : null}
                </label>

                <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                  <nav
                    aria-label={copy.paginationAriaLabel}
                    className="flex items-center gap-1"
                  >
                    <PaginationButton
                      label={copy.previousPage}
                      disabled={currentPage === 1}
                      onClick={() => replaceQuery({ pagina: currentPage - 1 })}
                    >
                      <ChevronLeft aria-hidden="true" className="size-4" />
                    </PaginationButton>

                    {paginationItems.map((item, index) =>
                      item === "ellipsis" ? (
                        <span
                          key={`ellipsis-${index}`}
                          aria-hidden="true"
                          className="px-1 text-sm text-muted-foreground"
                        >
                          …
                        </span>
                      ) : (
                        <PaginationButton
                          key={item}
                          label={`${copy.pageLabel} ${item}`}
                          active={item === currentPage}
                          onClick={() => replaceQuery({ pagina: item })}
                        >
                          {item}
                        </PaginationButton>
                      ),
                    )}

                    <PaginationButton
                      label={copy.nextPage}
                      disabled={currentPage === totalPages}
                      onClick={() => replaceQuery({ pagina: currentPage + 1 })}
                    >
                      <ChevronRight aria-hidden="true" className="size-4" />
                    </PaginationButton>
                  </nav>

                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="hidden sm:inline">{copy.perPage}</span>
                    <select
                      aria-label={copy.perPageAriaLabel}
                      value={pageSize}
                      onChange={(event) =>
                        replaceQuery({
                          porPagina: Number(event.target.value),
                          pagina: undefined,
                        })
                      }
                      className="h-10 rounded-lg border bg-background px-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {PAGE_SIZE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </section>

            {visibleDocuments.length ? (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {visibleDocuments.map((document) => (
                  <Link
                    key={document.id}
                    href={`/${locale}/laboratorios/${document.slug}`}
                    className="rounded-2xl border bg-card p-5 transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <p className="text-xs font-medium tracking-wide text-primary uppercase">
                      {categoryName(
                        taxonomy,
                        document.categoryId,
                        copy.defaultCategoryName,
                      )}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold">
                      {document.metadata.title}
                    </h3>
                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                      {document.metadata.summary || copy.defaultDocumentSummary}
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
                <h2 className="text-lg font-semibold">
                  {normalizedSearchQuery
                    ? copy.noResultsTitle
                    : copy.emptyTitle}
                </h2>
                <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                  {normalizedSearchQuery
                    ? copy.noResultsDescription.replace(
                        "{query}",
                        deferredSearchQuery.trim(),
                      )
                    : copy.emptyDescription}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );

  function createCatalogHref(categorySlug?: string, subcategorySlug?: string) {
    const params = new URLSearchParams();
    if (categorySlug) params.set("categoria", categorySlug);
    if (subcategorySlug) params.set("subcategoria", subcategorySlug);
    if (pageSize !== PAGE_SIZE_OPTIONS[0]) {
      params.set("porPagina", String(pageSize));
    }

    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function replaceQuery(updates: Record<string, string | number | undefined>) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === "") params.delete(key);
      else params.set(key, String(value));
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  function resetCurrentPage() {
    if (searchParams.has("pagina")) {
      replaceQuery({ pagina: undefined });
    }
  }
}

function PaginationButton({
  active = false,
  children,
  disabled = false,
  label,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={
        active
          ? "inline-flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground"
          : "inline-flex size-9 items-center justify-center rounded-lg text-sm font-medium transition hover:bg-muted disabled:pointer-events-none disabled:opacity-35"
      }
    >
      {children}
    </button>
  );
}

function navigationLinkClass(active: boolean, nested = false) {
  const spacing = nested ? "px-3 py-1.5 text-sm" : "px-3 py-2 text-sm";
  const state = active
    ? "bg-primary/10 font-semibold text-primary"
    : "text-foreground/85 hover:bg-muted hover:text-foreground";

  return `flex items-start justify-between gap-3 rounded-lg transition ${spacing} ${state}`;
}

function getPaginationItems(
  currentPage: number,
  totalPages: number,
): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([
    1,
    totalPages,
    currentPage - 1,
    currentPage,
    currentPage + 1,
  ]);
  const sortedPages = [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);
  const items: Array<number | "ellipsis"> = [];

  for (const page of sortedPages) {
    const previous = items.at(-1);
    if (typeof previous === "number" && page - previous > 1) {
      items.push("ellipsis");
    }
    items.push(page);
  }

  return items;
}

function categoryName(taxonomy: Taxonomy, id: string | null, fallback: string) {
  return (
    taxonomy.categories.find((category) => category.id === id)?.name ?? fallback
  );
}

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase("es")
    .trim();
}
