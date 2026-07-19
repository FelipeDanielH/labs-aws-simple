import type { ReactNode } from "react";

import { RootShell } from "@/app/root-shell";
import { getCachedTaxonomy } from "@/features/content-management/server/cached-content";

export default async function LegacyRootLayout({
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
