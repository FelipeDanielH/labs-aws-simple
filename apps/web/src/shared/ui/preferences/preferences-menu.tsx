"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover";
import { SelectField } from "@workspace/ui/components/select-field";
import { Settings } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  defaultTheme,
  locales,
  themes,
  type AppLocale,
  type AppTheme,
} from "@/shared/config/preferences";
import { messages } from "@/shared/config/translations";
import { useActiveLocale } from "@/shared/hooks/use-active-locale";
import { usePreferencesStore } from "@/shared/store/preferences-store";
import { localeCookieName } from "@/shared/config/locale-routing";

const subscribe = () => () => undefined;

export function PreferencesMenu() {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const { theme, setTheme } = useTheme();
  const locale = useActiveLocale();
  const hasHydrated = usePreferencesStore((state) => state.hasHydrated);
  const setLocale = usePreferencesStore((state) => state.setLocale);
  const pathname = usePathname();
  const router = useRouter();
  const copy = messages[locale];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={copy.settingsMenu}
          className="inline-flex size-9 items-center justify-center rounded-lg border border-transparent text-muted-foreground outline-none transition hover:border-border hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-border data-[state=open]:bg-muted data-[state=open]:text-foreground"
        >
          <Settings aria-hidden="true" className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="overflow-hidden p-0">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{copy.preferences}</h2>
        </div>
        <div className="grid gap-4 px-4 py-4">
          <SelectField
            id="header-language-selector"
            label={copy.language}
            options={locales.map((value) => ({
              value,
              label: copy.languages[value],
            }))}
            value={locale}
            onChange={(value) => {
              const nextLocale = value as AppLocale;
              setLocale(nextLocale);
              document.cookie = `${localeCookieName}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
              const segments = pathname.split("/");
              if (segments[1] === "es" || segments[1] === "en") {
                segments[1] = nextLocale;
                const alternate = document.getElementById(
                  "locale-route-alternates",
                )?.dataset[nextLocale];
                if (
                  alternate &&
                  segments[2] === "laboratorios" &&
                  segments[3]
                ) {
                  segments[3] = alternate;
                }
                router.push(segments.join("/") || `/${nextLocale}`);
              } else {
                router.push(
                  `/${nextLocale}${pathname === "/" ? "" : pathname}`,
                );
              }
            }}
            disabled={!hasHydrated}
            compact
          />
          <SelectField
            id="header-theme-selector"
            label={copy.theme}
            options={themes.map((value) => ({
              value,
              label: copy.themes[value],
            }))}
            value={isClient ? (theme ?? defaultTheme) : defaultTheme}
            onChange={(value) => setTheme(value as AppTheme)}
            disabled={!isClient}
            compact
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
