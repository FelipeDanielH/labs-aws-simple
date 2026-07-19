"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

import type { ContentLocale } from "@/features/content-management/domain/models";
import { usePreferencesStore } from "@/shared/store/preferences-store";

export function PreferencesProvider({
  children,
  locale: routeLocale,
}: Readonly<{ children: ReactNode; locale: ContentLocale }>) {
  useEffect(() => {
    usePreferencesStore.getState().setLocale(routeLocale);
    document.documentElement.lang = routeLocale;

    let active = true;
    void Promise.resolve(usePreferencesStore.persist.rehydrate()).then(() => {
      if (!active) return;
      const store = usePreferencesStore.getState();
      store.setLocale(routeLocale);
      store.markHydrated();
    });

    return () => {
      active = false;
    };
  }, [routeLocale]);

  return children;
}
