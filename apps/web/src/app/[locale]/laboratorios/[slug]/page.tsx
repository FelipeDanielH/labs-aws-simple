import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getContentRepository } from "@/features/content-management/server/container";
import { LaboratoryDetailShell } from "@/features/laboratories/ui/laboratory-detail-shell";
import { extractMarkdownTableOfContents } from "@/features/markdown-reader/presentation/rendering/markdown-heading-index";
import { MarkdownRenderer } from "@/features/markdown-reader/presentation/rendering/markdown-renderer";
import { localizeTaxonomy } from "@/shared/config/locale-routing";
import { assertContentLocale } from "@/shared/config/route-locale";
import { messages } from "@/shared/config/translations";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  assertContentLocale(locale);
  const document = await getContentRepository()
    .findPublishedBySlug(slug, locale)
    .catch(() => null);
  if (!document) {
    return {
      title: `${messages[locale].laboratoryDetail.notFoundTitle} | AWS Labs`,
    };
  }
  const languages = Object.fromEntries(
    Object.entries(document.entry.alternateSlugs).map(([key, value]) => [
      key,
      `/${key}/laboratorios/${value}`,
    ]),
  );
  return {
    title: `${document.entry.metadata.title} | AWS Labs`,
    description: document.entry.metadata.summary,
    alternates: { languages },
  };
}

export default async function LaboratoryDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  assertContentLocale(locale);
  const repository = getContentRepository();
  const [document, catalog, taxonomyState] = await Promise.all([
    repository.findPublishedBySlug(slug, locale).catch(() => null),
    repository.getPublicCatalog(locale),
    repository.get(),
  ]);
  if (!document) notFound();

  const taxonomy = localizeTaxonomy(taxonomyState.taxonomy, locale);
  const { entry } = document;
  const category = taxonomy.categories.find(
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
  const backHref = `/${locale}/laboratorios${backQuery ? `?${backQuery}` : ""}`;
  const tableOfContents =
    entry.content.kind === "markdown"
      ? extractMarkdownTableOfContents(document.source)
      : [];

  return (
    <>
      <span
        id="locale-route-alternates"
        data-es={entry.alternateSlugs.es ?? entry.slug}
        data-en={
          entry.alternateSlugs.en ?? entry.alternateSlugs.es ?? entry.slug
        }
        hidden
      />
      <LaboratoryDetailShell
        locale={locale}
        backHref={backHref}
        categoryName={
          category?.name ?? messages[locale].laboratoryDetail.laboratories
        }
        subcategoryName={subcategory?.name}
        currentLaboratoryId={entry.id}
        laboratories={laboratories}
        tableOfContents={tableOfContents}
      >
        {entry.content.kind === "markdown" ? (
          <MarkdownRenderer
            source={document.source}
            baseUrl={entry.content.assetBaseUrl ?? entry.content.url}
          />
        ) : (
          <iframe
            title={entry.metadata.title}
            src={`/${locale}/laboratorios/${entry.slug}/contenido`}
            sandbox=""
            className="min-h-[75vh] w-full rounded-xl border bg-white"
          />
        )}
      </LaboratoryDetailShell>
    </>
  );
}
