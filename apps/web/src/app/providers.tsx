"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import type { ReactNode } from "react";
import { useState } from "react";

import { PreferencesProvider } from "@/shared/providers/preferences-provider";
import { ThemeProvider } from "@/shared/providers/theme-provider";
import { CustomCursor } from "@/shared/ui/global-interactions/custom-cursor";
import { InterfaceAudioFeedback } from "@/shared/ui/global-interactions/interface-audio-feedback";

export function AppProviders({ children }: Readonly<{ children: ReactNode }>) {
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
      <PreferencesProvider>
        <QueryClientProvider client={queryClient}>
          {children}
          <CustomCursor />
          <InterfaceAudioFeedback />
          {process.env.NODE_ENV === "development" ? (
            <ReactQueryDevtools />
          ) : null}
        </QueryClientProvider>
      </PreferencesProvider>
    </ThemeProvider>
  );
}
