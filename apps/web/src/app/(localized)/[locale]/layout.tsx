import type { Metadata } from "next";
import type { ReactNode } from "react";

import { RootShell } from "@/app/root-shell";
import { getCachedTaxonomy } from "@/features/content-management/server/cached-content";
import { assertContentLocale } from "@/shared/config/route-locale";

export const metadata: Metadata = {
  title: "Felipe Henriquez | Laboratorios",
  description: "Base escalable con Next.js y arquitectura SOLID.",
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
