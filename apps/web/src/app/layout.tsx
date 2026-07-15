import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { AppProviders } from "@/app/providers";
import { getContentRepository } from "@/features/content-management/server/container";
import { SiteHeader } from "@/shared/ui/site-header/site-header";

import "./globals.css";

export const metadata: Metadata = {
  title: "Scalable Web Platform",
  description: "Base escalable con Next.js y arquitectura SOLID.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  await connection();

  const categories = await getContentRepository()
    .get()
    .then(({ taxonomy }) => taxonomy.categories)
    .catch(() => []);

  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <AppProviders>
          <SiteHeader categories={categories} />
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
