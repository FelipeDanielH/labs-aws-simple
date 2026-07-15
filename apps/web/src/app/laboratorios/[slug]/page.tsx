import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getContentRepository } from "@/features/content-management/server/container";
import { LaboratoryDetailShell } from "@/features/laboratories/ui/laboratory-detail-shell";
import { extractMarkdownTableOfContents } from "@/features/markdown-reader/presentation/rendering/markdown-heading-index";
import { MarkdownRenderer } from "@/features/markdown-reader/presentation/rendering/markdown-renderer";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const document = await getContentRepository()
    .findPublishedBySlug(slug)
    .catch(() => null);
  return document
    ? {
        title: `${document.entry.metadata.title} | AWS Labs`,
        description: document.entry.metadata.summary,
      }
    : { title: "Laboratorio no encontrado | AWS Labs" };
}

export default async function LaboratoryDetailPage({ params }: Props) {
  const { slug } = await params;
  const repository = getContentRepository();
  const [document, catalog, versionedTaxonomy] = await Promise.all([
    repository.findPublishedBySlug(slug).catch(() => null),
    repository.getPublicCatalog().catch(() => ({
      schemaVersion: 1 as const,
      generatedAt: new Date(0).toISOString(),
      documents: [],
    })),
    repository.get().catch(() => ({
      taxonomy: {
        schemaVersion: 1 as const,
        categories: [],
        updatedAt: new Date(0).toISOString(),
      },
      etag: null,
    })),
  ]);
  if (!document) notFound();

  const { entry } = document;
  const category = versionedTaxonomy.taxonomy.categories.find(
    (item) => item.id === entry.categoryId,
  );
  const subcategory = category?.subcategories.find(
    (item) => item.id === entry.subcategoryId,
  );
  const laboratories = catalog.documents
    .filter(
      (item) =>
        item.categoryId === entry.categoryId &&
        item.subcategoryId === entry.subcategoryId,
    )
    .map((item) => ({
      id: item.id,
      slug: item.slug,
      title: item.metadata.title,
    }));

  if (!laboratories.some((item) => item.id === entry.id)) {
    laboratories.unshift({
      id: entry.id,
      slug: entry.slug,
      title: entry.metadata.title,
    });
  }

  const backParams = new URLSearchParams();
  if (category) backParams.set("categoria", category.slug);
  if (subcategory) backParams.set("subcategoria", subcategory.slug);
  const backQuery = backParams.toString();
  const backHref = backQuery ? `/laboratorios?${backQuery}` : "/laboratorios";
  const tableOfContents = extractMarkdownTableOfContents(document.markdown);

  return (
    <LaboratoryDetailShell
      backHref={backHref}
      categoryName={category?.name ?? "Laboratorios"}
      subcategoryName={subcategory?.name}
      currentLaboratoryId={entry.id}
      laboratories={laboratories}
      tableOfContents={tableOfContents}
    >
      <MarkdownRenderer
        source={document.markdown}
        baseUrl={entry.markdownUrl}
      />
    </LaboratoryDetailShell>
  );
}
