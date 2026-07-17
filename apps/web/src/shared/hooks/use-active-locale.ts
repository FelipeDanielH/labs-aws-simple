"use client";

import { usePathname } from "next/navigation";

import { localeFromPathname } from "@/shared/config/locale-routing";
import { usePreferencesStore } from "@/shared/store/preferences-store";

export function useActiveLocale() {
  const storedLocale = usePreferencesStore((state) => state.locale);
  return localeFromPathname(usePathname(), storedLocale);
}
