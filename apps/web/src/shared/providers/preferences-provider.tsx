"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { localeFromPathname } from "@/shared/config/locale-routing";
import { usePreferencesStore } from "@/shared/store/preferences-store";

export function PreferencesProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const locale = usePreferencesStore((state) => state.locale);
  const pathname = usePathname();

  useEffect(() => {
    let active = true;
    void Promise.resolve(usePreferencesStore.persist.rehydrate()).then(() => {
      if (!active) return;
      const store = usePreferencesStore.getState();
      store.setLocale(
        localeFromPathname(window.location.pathname, store.locale),
      );
      store.markHydrated();
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const store = usePreferencesStore.getState();
    store.setLocale(localeFromPathname(pathname, store.locale));
  }, [pathname]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return children;
}
