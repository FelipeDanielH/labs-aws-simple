"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import {
  taxonomyLabel,
  type Category,
  type ContentLocale,
} from "@/features/content-management/domain/models";
import { messages } from "@/shared/config/translations";
import { PreferencesMenu } from "@/shared/ui/preferences/preferences-menu";

type NavigationCategory = Category;

export function SiteHeader({
  categories,
  locale,
}: {
  categories: NavigationCategory[];
  locale: ContentLocale;
}) {
  const copy = messages[locale].navigation;

  return (
    <header className="sticky top-0 z-50 h-16 px-2 py-1.5 sm:px-4">
      <div className="grid h-full w-full grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-[1.4rem] border border-foreground/10 bg-background/68 px-3 shadow-lg shadow-black/5 ring-1 ring-white/15 backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-background/52 sm:px-5">
        <Link
          href={`/${locale}`}
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
              locale={locale}
              selectedCategory={null}
            />
          }
        >
          <CategoryNavigation
            ariaLabel={copy.main}
            categories={categories}
            locale={locale}
          />
        </Suspense>

        <div className="flex items-center justify-end">
          <Suspense fallback={null}>
            <PreferencesMenu />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

function CategoryNavigation({
  ariaLabel,
  categories,
  locale,
}: {
  ariaLabel: string;
  categories: NavigationCategory[];
  locale: ContentLocale;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedCategory = pathname.endsWith("/laboratorios")
    ? searchParams.get("categoria")
    : null;

  return (
    <CategoryLinks
      ariaLabel={ariaLabel}
      categories={categories}
      locale={locale}
      selectedCategory={selectedCategory}
    />
  );
}

function CategoryLinks({
  ariaLabel,
  categories,
  locale,
  selectedCategory,
}: {
  ariaLabel: string;
  categories: NavigationCategory[];
  locale: ContentLocale;
  selectedCategory: string | null;
}) {
  return (
    <nav aria-label={ariaLabel} className="max-w-[60vw] overflow-x-auto">
      <div className="flex w-max items-center gap-1">
        {categories.map((category) => {
          const label = taxonomyLabel(category, locale) ?? {
            name: category.name,
            slug: category.slug,
          };
          const isActive =
            selectedCategory === label.slug || selectedCategory === category.id;

          return (
            <Link
              key={category.id}
              href={`/${locale}/laboratorios?categoria=${encodeURIComponent(label.slug)}`}
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "rounded-lg bg-primary px-4 py-2 text-sm font-medium whitespace-nowrap text-primary-foreground"
                  : "rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition hover:bg-muted hover:text-foreground"
              }
            >
              {label.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
