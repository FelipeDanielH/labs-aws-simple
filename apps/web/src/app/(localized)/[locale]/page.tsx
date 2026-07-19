import type { Metadata } from "next";

import { HOME_SPLINE_SCENE_URL } from "@/features/home/config/spline-scene";
import { HomeContent } from "@/features/home/ui/home-content";
import { assertContentLocale } from "@/shared/config/route-locale";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  assertContentLocale(locale);

  return {
    title:
      locale === "en"
        ? "Felipe Henriquez | Laboratories"
        : "Felipe Henriquez | Laboratorios",
  };
}

export default async function LocalizedHomePage({ params }: Props) {
  const { locale } = await params;
  assertContentLocale(locale);
  return (
    <>
      <link rel="preload" href={HOME_SPLINE_SCENE_URL} as="fetch" />
      <HomeContent />
    </>
  );
}
