"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";

import {
  LaboratoryTableOfContents,
  useActiveLaboratoryHeading,
} from "./laboratory-table-of-contents";
import type { MarkdownTableOfContentsItem } from "@/features/markdown-reader/presentation/rendering/markdown-heading-index";

export type LaboratoryNavigationItem = {
  id: string;
  slug: string;
  title: string;
};

export function LaboratoryDetailShell({
  backHref,
  categoryName,
  children,
  currentLaboratoryId,
  laboratories,
  subcategoryName,
  tableOfContents,
}: {
  backHref: string;
  categoryName: string;
  children: ReactNode;
  currentLaboratoryId: string;
  laboratories: LaboratoryNavigationItem[];
  subcategoryName?: string;
  tableOfContents: MarkdownTableOfContentsItem[];
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const { activeId, setActiveId } = useActiveLaboratoryHeading(tableOfContents);
  const hasTableOfContents = tableOfContents.length > 0;
  const gridClassName = hasTableOfContents
    ? isSidebarOpen
      ? "grid transition-[grid-template-columns] duration-200 lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)_16rem]"
      : "grid transition-[grid-template-columns] duration-200 lg:grid-cols-[4.5rem_minmax(0,1fr)] xl:grid-cols-[4.5rem_minmax(0,1fr)_16rem]"
    : isSidebarOpen
      ? "grid transition-[grid-template-columns] duration-200 lg:grid-cols-[18rem_minmax(0,1fr)]"
      : "grid transition-[grid-template-columns] duration-200 lg:grid-cols-[4.5rem_minmax(0,1fr)]";

  return (
    <main className="min-h-[calc(100vh-4rem)]">
      <div className={gridClassName}>
        <aside className="border-b bg-card lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:overflow-y-auto lg:border-r lg:border-b-0">
          <div
            className={
              isSidebarOpen
                ? "flex min-h-20 items-start justify-between gap-3 border-b px-5 py-4"
                : "flex min-h-20 items-center justify-center border-b px-3 py-4"
            }
          >
            {isSidebarOpen ? (
              <Link
                href={backHref}
                className="min-w-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <p className="truncate font-semibold">{categoryName}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {subcategoryName ?? "Laboratorios"}
                </p>
              </Link>
            ) : null}

            <button
              type="button"
              aria-controls="laboratory-sidebar-navigation"
              aria-expanded={isSidebarOpen}
              aria-label={isSidebarOpen ? "Contraer menú" : "Expandir menú"}
              onClick={() => setIsSidebarOpen((value) => !value)}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {isSidebarOpen ? (
                <PanelLeftClose aria-hidden="true" className="size-5" />
              ) : (
                <PanelLeftOpen aria-hidden="true" className="size-5" />
              )}
            </button>
          </div>

          {isSidebarOpen ? (
            <nav
              id="laboratory-sidebar-navigation"
              aria-label="Laboratorios de esta sección"
              className="p-3"
            >
              <p className="px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Laboratorios
              </p>
              <ul className="space-y-1">
                {laboratories.map((laboratory) => {
                  const isCurrent = laboratory.id === currentLaboratoryId;

                  return (
                    <li key={laboratory.id}>
                      <Link
                        href={`/laboratorios/${laboratory.slug}`}
                        aria-current={isCurrent ? "page" : undefined}
                        className={
                          isCurrent
                            ? "block rounded-lg border-l-2 border-primary bg-primary/10 px-3 py-2.5 text-sm font-semibold text-primary"
                            : "block rounded-lg border-l-2 border-transparent px-3 py-2.5 text-sm text-foreground/85 transition hover:bg-muted hover:text-foreground"
                        }
                      >
                        {laboratory.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : null}
        </aside>

        <div className="min-w-0 px-4 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
          {hasTableOfContents ? (
            <details className="mx-auto mb-5 max-w-5xl rounded-xl border bg-card p-4 xl:hidden">
              <summary className="cursor-pointer text-sm font-semibold">
                En esta página
              </summary>
              <div className="mt-3">
                <LaboratoryTableOfContents
                  activeId={activeId}
                  items={tableOfContents}
                  onNavigate={setActiveId}
                />
              </div>
            </details>
          ) : null}
          <article className="mx-auto max-w-5xl rounded-2xl border bg-card p-6 sm:p-10">
            {children}
          </article>
        </div>

        {hasTableOfContents ? (
          <aside className="hidden px-5 py-12 xl:block">
            <div className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto">
              <LaboratoryTableOfContents
                activeId={activeId}
                items={tableOfContents}
                onNavigate={setActiveId}
              />
            </div>
          </aside>
        ) : null}
      </div>
    </main>
  );
}
