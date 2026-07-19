import type { ReactNode } from "react";

import { AppProviders } from "@/app/providers";
import type { Category } from "@/features/content-management/domain/models";
import { SiteHeader } from "@/shared/ui/site-header/site-header";

import "./globals.css";

export function RootShell({
  children,
  lang,
  categories,
}: {
  children: ReactNode;
  lang: "es" | "en";
  categories: Category[];
}) {
  return (
    <html lang={lang} suppressHydrationWarning>
      <body>
        <AppProviders locale={lang}>
          <SiteHeader locale={lang} categories={categories} />
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
