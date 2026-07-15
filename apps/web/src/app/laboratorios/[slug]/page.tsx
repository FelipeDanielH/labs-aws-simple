import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getContentRepository } from "@/features/content-management/server/container";
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
        title: `${document.manifest.metadata.title} | AWS Labs`,
        description: document.manifest.metadata.summary,
      }
    : { title: "Laboratorio no encontrado | AWS Labs" };
}

export default async function LaboratoryDetailPage({ params }: Props) {
  const { slug } = await params;
  const document = await getContentRepository()
    .findPublishedBySlug(slug)
    .catch(() => null);
  if (!document) notFound();
  return (
    <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-4xl px-6 py-12 sm:py-16">
      <article className="rounded-2xl border bg-card p-6 sm:p-10">
        <MarkdownRenderer
          source={document.markdown}
          baseUrl={document.manifest.markdownUrl}
        />
      </article>
    </main>
  );
}
