"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Suspense, type ReactNode, useState } from "react";

import type { ContentLocale } from "@/features/content-management/domain/models";
import { PreferencesProvider } from "@/shared/providers/preferences-provider";
import { ThemeProvider } from "@/shared/providers/theme-provider";
import { CustomCursor } from "@/shared/ui/global-interactions/custom-cursor";
import { InterfaceAudioFeedback } from "@/shared/ui/global-interactions/interface-audio-feedback";

export function AppProviders({
  children,
  locale,
}: Readonly<{ children: ReactNode; locale: ContentLocale }>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <ThemeProvider>
      <PreferencesProvider locale={locale}>
        <QueryClientProvider client={queryClient}>
          {children}
          <CustomCursor />
          <Suspense fallback={null}>
            <InterfaceAudioFeedback />
          </Suspense>
          {process.env.NODE_ENV === "development" ? (
            <ReactQueryDevtools />
          ) : null}
        </QueryClientProvider>
      </PreferencesProvider>
    </ThemeProvider>
  );
}
