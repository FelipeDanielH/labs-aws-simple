"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

import { defaultTheme, themes } from "@/shared/config/preferences";

export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme={defaultTheme}
      enableSystem={false}
      themes={[...themes]}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
