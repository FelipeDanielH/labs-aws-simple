"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { messages } from "@/shared/config/translations";
import { usePreferencesStore } from "@/shared/store/preferences-store";
import { PreferencesMenu } from "@/shared/ui/preferences/preferences-menu";

const navigation = [
  { href: "/laboratorios", labelKey: "laboratories" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const locale = usePreferencesStore((state) => state.locale);
  const copy = messages[locale].navigation;

  return (
    <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-6">
        <Link
          href="/"
          aria-label={copy.home}
          className="group flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Image
            src="/assets/header-icon/header.png"
            alt=""
            width={44}
            height={44}
            priority
            className="size-11 rounded-xl border object-cover shadow-sm transition group-hover:scale-[1.03]"
          />
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">
            AWS Labs
          </span>
        </Link>

        <div className="flex items-center gap-1">
          <nav aria-label={copy.main} className="flex items-center gap-1">
            {navigation.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    isActive
                      ? "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                      : "rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  }
                >
                  {copy[item.labelKey]}
                </Link>
              );
            })}
          </nav>
          <PreferencesMenu />
        </div>
      </div>
    </header>
  );
}
