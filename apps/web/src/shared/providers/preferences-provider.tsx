"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

import { usePreferencesStore } from "@/shared/store/preferences-store";

export function PreferencesProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const locale = usePreferencesStore((state) => state.locale);

  useEffect(() => {
    void Promise.resolve(usePreferencesStore.persist.rehydrate()).then(() => {
      usePreferencesStore.getState().markHydrated();
    });
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return children;
}
