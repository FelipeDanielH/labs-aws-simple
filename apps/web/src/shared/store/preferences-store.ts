import { create } from "zustand";
import { persist } from "zustand/middleware";

import { defaultLocale, type AppLocale } from "@/shared/config/preferences";

type PreferencesState = {
  locale: AppLocale;
  hasHydrated: boolean;
  setLocale: (locale: AppLocale) => void;
  markHydrated: () => void;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      locale: defaultLocale,
      hasHydrated: false,
      setLocale: (locale) => set({ locale }),
      markHydrated: () => set({ hasHydrated: true }),
    }),
    {
      name: "web-platform-preferences",
      partialize: ({ locale }) => ({ locale }),
      skipHydration: true,
    },
  ),
);
