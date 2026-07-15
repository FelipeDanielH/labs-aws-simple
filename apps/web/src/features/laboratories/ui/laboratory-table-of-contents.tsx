"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

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
  windowed = false,
}: {
  activeId: string | null;
  items: MarkdownTableOfContentsItem[];
  onNavigate: (id: string) => void;
  windowed?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const [windowState, setWindowState] = useState({
    hasPrevious: false,
    hasNext: false,
  });

  useLayoutEffect(() => {
    if (!windowed) return;

    const viewport = viewportRef.current;
    const list = listRef.current;
    if (!viewport || !list) return;

    const updateIndicators = () => {
      const maxScrollTop = Math.max(
        0,
        viewport.scrollHeight - viewport.clientHeight,
      );
      const nextState = {
        hasPrevious: viewport.scrollTop > 1,
        hasNext: maxScrollTop - viewport.scrollTop > 1,
      };

      setWindowState((current) =>
        current.hasPrevious === nextState.hasPrevious &&
        current.hasNext === nextState.hasNext
          ? current
          : nextState,
      );
    };
    const keepActiveItemVisible = () => {
      const activeItem = activeId ? itemRefs.current.get(activeId) : null;
      const viewportHeight = viewport.clientHeight;
      if (!activeItem || !viewportHeight) return;

      const activeBottom = activeItem.offsetTop + activeItem.offsetHeight;
      const maxScrollTop = Math.max(0, list.scrollHeight - viewportHeight);
      const scrollTop = Math.min(
        Math.max(0, activeBottom - viewportHeight + 12),
        maxScrollTop,
      );

      viewport.scrollTo({
        top: scrollTop,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
      updateIndicators();
    };
    const handleResize = () => {
      keepActiveItemVisible();
      updateIndicators();
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(viewport);
    resizeObserver.observe(list);
    viewport.addEventListener("scroll", updateIndicators, { passive: true });
    keepActiveItemVisible();
    updateIndicators();

    return () => {
      resizeObserver.disconnect();
      viewport.removeEventListener("scroll", updateIndicators);
    };
  }, [activeId, items, windowed]);

  const list = (
    <ul ref={listRef} className="relative border-l">
      {items.map((item) => {
        const isActive = item.id === activeId;

        return (
          <li
            key={item.id}
            ref={(node) => {
              if (node) itemRefs.current.set(item.id, node);
              else itemRefs.current.delete(item.id);
            }}
          >
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
  );

  return (
    <nav aria-label="En esta página">
      <h2 className="text-sm font-semibold">En esta página</h2>
      {windowed ? (
        <div
          ref={viewportRef}
          tabIndex={0}
          className="relative mt-3 h-[calc(100vh-12rem)] min-h-64 overflow-y-auto [scrollbar-width:none] outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-scrollbar]:hidden"
        >
          {list}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-background to-transparent transition-opacity ${
              windowState.hasPrevious ? "opacity-100" : "opacity-0"
            }`}
          />
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background to-transparent transition-opacity ${
              windowState.hasNext ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>
      ) : (
        <div className="mt-3">{list}</div>
      )}
    </nav>
  );
}
