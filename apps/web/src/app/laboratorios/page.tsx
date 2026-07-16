import type { Metadata } from "next";

import { LaboratoriesContent } from "@/features/laboratories/ui/laboratories-content";
import { getContentRepository } from "@/features/content-management/server/container";

export const metadata: Metadata = {
  title: "Laboratorios | AWS Labs",
  description: "Catálogo de laboratorios y entregables de AWS Labs.",
};

export const dynamic = "force-dynamic";

export default async function LaboratoriesPage() {
  const repository = getContentRepository();
  const [catalog, taxonomy] = await Promise.all([
    repository.getPublicCatalog().catch(() => ({
      schemaVersion: 2 as const,
      generatedAt: new Date(0).toISOString(),
      documents: [],
    })),
    repository
      .get()
      .then((value) => value.taxonomy)
      .catch(() => ({
        schemaVersion: 1 as const,
        categories: [],
        updatedAt: new Date(0).toISOString(),
      })),
  ]);
  return (
    <LaboratoriesContent documents={catalog.documents} taxonomy={taxonomy} />
  );
}
