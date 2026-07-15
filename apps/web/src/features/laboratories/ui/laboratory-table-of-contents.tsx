"use client";

import { useEffect, useState } from "react";

import type { MarkdownTableOfContentsItem } from "@/features/markdown-reader/presentation/rendering/markdown-heading-index";

export function useActiveLaboratoryHeading(
  items: MarkdownTableOfContentsItem[],
) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? null);

  useEffect(() => {
    const headings = items
      .map((item) => document.getElementById(item.id))
      .filter((heading): heading is HTMLElement => heading !== null);
    if (!headings.length) return;

    let animationFrame = 0;
    const updateActiveHeading = () => {
      animationFrame = 0;
      const activationOffset = 96;
      const isAtDocumentEnd =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2;
      const activeHeading = isAtDocumentEnd
        ? headings.at(-1)
        : ([...headings]
            .reverse()
            .find(
              (heading) =>
                heading.getBoundingClientRect().top <= activationOffset,
            ) ?? headings[0]);

      if (activeHeading) setActiveId(activeHeading.id);
    };
    const scheduleUpdate = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(updateActiveHeading);
    };
    const observer = new IntersectionObserver(scheduleUpdate, {
      rootMargin: "-80px 0px -65% 0px",
      threshold: [0, 1],
    });

    headings.forEach((heading) => observer.observe(heading));
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    updateActiveHeading();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [items]);

  return { activeId, setActiveId };
}

export function LaboratoryTableOfContents({
  activeId,
  items,
  onNavigate,
}: {
  activeId: string | null;
  items: MarkdownTableOfContentsItem[];
  onNavigate: (id: string) => void;
}) {
  return (
    <nav aria-label="En esta página">
      <h2 className="text-sm font-semibold">En esta página</h2>
      <ul className="mt-3 border-l">
        {items.map((item) => {
          const isActive = item.id === activeId;

          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={isActive ? "location" : undefined}
                onClick={() => onNavigate(item.id)}
                className={`block border-l-2 py-1.5 text-sm transition ${
                  item.level === 3 ? "pl-6" : "pl-4"
                } ${
                  isActive
                    ? "-ml-px border-primary font-semibold text-primary"
                    : "-ml-px border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.title}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
