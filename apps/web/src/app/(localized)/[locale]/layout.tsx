import type { Metadata } from "next";
import type { ReactNode } from "react";

import { RootShell } from "@/app/root-shell";
import { getCachedTaxonomy } from "@/features/content-management/server/cached-content";
import { assertContentLocale } from "@/shared/config/route-locale";

export const metadata: Metadata = {
  title: "Felipe Henriquez | Laboratorios",
  description:
    "Laboratorios prácticos de AWS con guías, documentación y recursos paso a paso.",
};

export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

export default async function LocalizedRootLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  assertContentLocale(locale);
  const categories = await getCachedTaxonomy()
    .then(({ taxonomy }) => taxonomy.categories)
    .catch(() => []);

  return (
    <RootShell lang={locale} categories={categories}>
      {children}
    </RootShell>
  );
}
