"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { usePreferencesStore } from "@/shared/store/preferences-store";

export function PreferencesProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const locale = usePreferencesStore((state) => state.locale);
  const pathname = usePathname();

  useEffect(() => {
    void Promise.resolve(usePreferencesStore.persist.rehydrate()).then(() => {
      usePreferencesStore.getState().markHydrated();
    });
  }, []);

  useEffect(() => {
    const routeLocale = pathname.split("/")[1];
    if (routeLocale === "es" || routeLocale === "en") {
      usePreferencesStore.getState().setLocale(routeLocale);
    }
  }, [pathname]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return children;
}
