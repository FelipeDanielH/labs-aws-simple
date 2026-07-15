"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import type { Category } from "@/features/content-management/domain/models";
import { messages } from "@/shared/config/translations";
import { usePreferencesStore } from "@/shared/store/preferences-store";
import { PreferencesMenu } from "@/shared/ui/preferences/preferences-menu";

type NavigationCategory = Pick<Category, "id" | "slug" | "name">;

export function SiteHeader({
  categories,
}: {
  categories: NavigationCategory[];
}) {
  const locale = usePreferencesStore((state) => state.locale);
  const copy = messages[locale].navigation;

  return (
    <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="grid h-16 w-full grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6">
        <Link
          href="/"
          aria-label={copy.home}
          className="group flex w-fit min-w-0 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Image
            src="/assets/header-icon/header.png"
            alt=""
            width={44}
            height={44}
            priority
            className="size-11 rounded-xl border object-cover shadow-sm transition group-hover:scale-[1.03]"
          />
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">
            AWS Labs
          </span>
        </Link>

        <Suspense
          fallback={
            <CategoryLinks
              ariaLabel={copy.main}
              categories={categories}
              selectedCategory={null}
            />
          }
        >
          <CategoryNavigation
            ariaLabel={copy.main}
            categories={categories}
          />
        </Suspense>

        <div className="flex items-center justify-end">
          <PreferencesMenu />
        </div>
      </div>
    </header>
  );
}

function CategoryNavigation({
  ariaLabel,
  categories,
}: {
  ariaLabel: string;
  categories: NavigationCategory[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedCategory =
    pathname === "/laboratorios" ? searchParams.get("categoria") : null;

  return (
    <CategoryLinks
      ariaLabel={ariaLabel}
      categories={categories}
      selectedCategory={selectedCategory}
    />
  );
}

function CategoryLinks({
  ariaLabel,
  categories,
  selectedCategory,
}: {
  ariaLabel: string;
  categories: NavigationCategory[];
  selectedCategory: string | null;
}) {
  return (
    <nav aria-label={ariaLabel} className="max-w-[60vw] overflow-x-auto">
      <div className="flex w-max items-center gap-1">
        {categories.map((category) => {
          const isActive =
            selectedCategory === category.slug ||
            selectedCategory === category.id;

          return (
            <Link
              key={category.id}
              href={`/laboratorios?categoria=${encodeURIComponent(category.slug)}`}
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "rounded-lg bg-primary px-4 py-2 text-sm font-medium whitespace-nowrap text-primary-foreground"
                  : "rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition hover:bg-muted hover:text-foreground"
              }
            >
              {category.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
