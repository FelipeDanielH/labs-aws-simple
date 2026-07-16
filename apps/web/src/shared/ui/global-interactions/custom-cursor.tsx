"use client";

import { useEffect, useRef } from "react";

const NATIVE_CURSOR_SELECTOR =
  "input, textarea, select, [contenteditable='true'], [data-native-cursor]";
const INTERACTIVE_SELECTOR =
  "a, button, summary, [role='button'], [role='link'], [data-cursor-interactive]";
const RING_EASING = 0.2;

type Point = {
  x: number;
  y: number;
};

export function CustomCursor() {
  const layerRef = useRef<HTMLDivElement>(null);
  const dotPositionRef = useRef<HTMLSpanElement>(null);
  const ringPositionRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    const dotPosition = dotPositionRef.current;
    const ringPosition = ringPositionRef.current;

    if (!layer || !dotPosition || !ringPosition) {
      return;
    }

    const finePointerQuery = window.matchMedia("(pointer: fine)");
    const reducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const target: Point = { x: -100, y: -100 };
    const ring: Point = { x: -100, y: -100 };
    let animationFrameId = 0;
    let isVisible = false;

    const updatePosition = (element: HTMLElement, point: Point) => {
      element.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;
    };

    const animateRing = () => {
      const easing = reducedMotionQuery.matches ? 1 : RING_EASING;
      ring.x += (target.x - ring.x) * easing;
      ring.y += (target.y - ring.y) * easing;
      updatePosition(ringPosition, ring);

      if (isVisible) {
        animationFrameId = window.requestAnimationFrame(animateRing);
      }
    };

    const hideCursor = () => {
      isVisible = false;
      layer.dataset.visible = "false";
      window.cancelAnimationFrame(animationFrameId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!finePointerQuery.matches || event.pointerType !== "mouse") {
        hideCursor();
        return;
      }

      const element = event.target instanceof Element ? event.target : null;
      const needsNativeCursor = Boolean(element?.closest(NATIVE_CURSOR_SELECTOR));

      if (needsNativeCursor) {
        hideCursor();
        return;
      }

      target.x = event.clientX;
      target.y = event.clientY;
      updatePosition(dotPosition, target);
      layer.dataset.interactive = String(
        Boolean(element?.closest(INTERACTIVE_SELECTOR)),
      );

      if (!isVisible) {
        isVisible = true;
        ring.x = target.x;
        ring.y = target.y;
        layer.dataset.visible = "true";
        animationFrameId = window.requestAnimationFrame(animateRing);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.isPrimary && event.pointerType === "mouse") {
        layer.dataset.pressed = "true";
      }
    };

    const handlePointerUp = () => {
      layer.dataset.pressed = "false";
    };

    const handlePointerCapabilityChange = () => {
      document.documentElement.dataset.customCursor = String(
        finePointerQuery.matches,
      );

      if (!finePointerQuery.matches) {
        hideCursor();
      }
    };

    handlePointerCapabilityChange();
    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    window.addEventListener("pointerdown", handlePointerDown, {
      passive: true,
    });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    window.addEventListener("pointercancel", handlePointerUp, {
      passive: true,
    });
    window.addEventListener("blur", hideCursor);
    document.documentElement.addEventListener("mouseleave", hideCursor);
    finePointerQuery.addEventListener("change", handlePointerCapabilityChange);

    return () => {
      hideCursor();
      delete document.documentElement.dataset.customCursor;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("blur", hideCursor);
      document.documentElement.removeEventListener("mouseleave", hideCursor);
      finePointerQuery.removeEventListener(
        "change",
        handlePointerCapabilityChange,
      );
    };
  }, []);

  return (
    <div
      ref={layerRef}
      aria-hidden="true"
      className="custom-cursor-layer"
      data-interactive="false"
      data-pressed="false"
      data-visible="false"
    >
      <span ref={ringPositionRef} className="custom-cursor-position">
        <span className="custom-cursor-ring" />
      </span>
      <span ref={dotPositionRef} className="custom-cursor-position">
        <span className="custom-cursor-dot" />
      </span>
    </div>
  );
}
