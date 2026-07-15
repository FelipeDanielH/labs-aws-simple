import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppProviders } from "@/app/providers";
import { SiteHeader } from "@/shared/ui/site-header/site-header";

import "./globals.css";

export const metadata: Metadata = {
  title: "Scalable Web Platform",
  description: "Base escalable con Next.js y arquitectura SOLID.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <AppProviders>
          <SiteHeader />
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
