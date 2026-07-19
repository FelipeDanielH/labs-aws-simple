"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ComponentProps, useRef } from "react";

type Props = Omit<ComponentProps<typeof Link>, "href" | "prefetch"> & {
  href: string;
};

export function IntentPrefetchLink({
  href,
  onFocus,
  onMouseEnter,
  ...props
}: Props) {
  const router = useRouter();
  const prefetchedHref = useRef<string | null>(null);

  function prefetch() {
    if (prefetchedHref.current === href) return;
    prefetchedHref.current = href;
    router.prefetch(href);
  }

  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        prefetch();
      }}
      onFocus={(event) => {
        onFocus?.(event);
        prefetch();
      }}
    />
  );
}
