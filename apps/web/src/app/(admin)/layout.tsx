import type { Metadata } from "next";
import type { ReactNode } from "react";

import { RootShell } from "@/app/root-shell";
import { getCachedTaxonomy } from "@/features/content-management/server/cached-content";

export const metadata: Metadata = {
  title: "Felipe Henriquez | Administración",
  description: "Administración de laboratorios AWS.",
};

export default async function AdminRootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const categories = await getCachedTaxonomy()
    .then(({ taxonomy }) => taxonomy.categories)
    .catch(() => []);
  return (
    <RootShell lang="es" categories={categories}>
      {children}
    </RootShell>
  );
}
