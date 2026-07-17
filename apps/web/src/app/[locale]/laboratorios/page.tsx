import type { Metadata } from "next";

import { getContentRepository } from "@/features/content-management/server/container";
import { LaboratoriesContent } from "@/features/laboratories/ui/laboratories-content";
import { localizeTaxonomy } from "@/shared/config/locale-routing";
import { assertContentLocale } from "@/shared/config/route-locale";

export const dynamic = "force-dynamic";
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

export default async function LaboratoriesPage({ params }: Props) {
  const { locale } = await params;
  assertContentLocale(locale);
  const repository = getContentRepository();
  const [catalog, taxonomy] = await Promise.all([
    repository.getPublicCatalog(locale).catch(() => ({
      schemaVersion: 3 as const,
      locale,
      generatedAt: new Date(0).toISOString(),
      documents: [],
    })),
    repository.get().then((value) => value.taxonomy),
  ]);
  return (
    <LaboratoriesContent
      locale={locale}
      documents={catalog.documents}
      taxonomy={localizeTaxonomy(taxonomy, locale)}
    />
  );
}
