import type { Metadata } from "next";
import { Suspense } from "react";

import {
  getCachedPublicCatalog,
  getCachedTaxonomy,
} from "@/features/content-management/server/cached-content";
import { LaboratoriesContent } from "@/features/laboratories/ui/laboratories-content";
import { localizeTaxonomy } from "@/shared/config/locale-routing";
import { assertContentLocale } from "@/shared/config/route-locale";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  assertContentLocale(locale);
  return locale === "en"
    ? {
        title: "Laboratories | AWS Labs",
        description: "AWS Labs catalog and deliverables.",
      }
    : {
        title: "Laboratorios | AWS Labs",
        description: "Catálogo de laboratorios y entregables de AWS Labs.",
      };
}

export default function LaboratoriesPage({ params }: Props) {
  return (
    <Suspense fallback={<main aria-busy="true" className="min-h-screen" />}>
      <Laboratories params={params} />
    </Suspense>
  );
}

async function Laboratories({ params }: Props) {
  const { locale } = await params;
  assertContentLocale(locale);
  const [catalog, taxonomy] = await Promise.all([
    getCachedPublicCatalog(locale).catch(() => ({
      schemaVersion: 3 as const,
      locale,
      generatedAt: new Date(0).toISOString(),
      documents: [],
    })),
    getCachedTaxonomy().then((value) => value.taxonomy),
  ]);
  return (
    <LaboratoriesContent
      locale={locale}
      documents={catalog.documents}
      taxonomy={localizeTaxonomy(taxonomy, locale)}
    />
  );
}
