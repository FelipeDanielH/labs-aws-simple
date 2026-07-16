"use client";

import { useEffect, useRef } from "react";

const NATIVE_CURSOR_SELECTOR =
  "input, textarea, [contenteditable='true'], [data-native-cursor]";
const INTERACTIVE_SELECTOR = [
  "a",
  "button",
  "select",
  "option",
  "summary",
  "[role='button']",
  "[role='link']",
  "[role='menuitem']",
  "[role='menuitemcheckbox']",
  "[role='menuitemradio']",
  "[role='option']",
  "[data-cursor-interactive]",
].join(", ");
const MAX_PARTICLES = 300;
const MAX_PARTICLES_PER_MOVE = 16;
const PARTICLE_SPACING = 3.25;
const TRAIL_ORIGIN_OFFSET: Point = { x: 7, y: 20 };
const TRAIL_BASE_HALF_WIDTH = 5.5;

type Point = {
  x: number;
  y: number;
};

type TrailParticle = Point & {
  velocityX: number;
  velocityY: number;
  age: number;
  lifetime: number;
  size: number;
  isDiamond: boolean;
};

function distanceBetween(start: Point, end: Point) {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

export function CustomCursor() {
  const layerRef = useRef<HTMLDivElement>(null);
  const trailCanvasRef = useRef<HTMLCanvasElement>(null);
  const cursorPositionRef = useRef<HTMLSpanElement>(null);
  const cursorShapeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    const canvas = trailCanvasRef.current;
    const cursorPosition = cursorPositionRef.current;
    const cursorShape = cursorShapeRef.current;
    const context = canvas?.getContext("2d");

    if (!layer || !canvas || !cursorPosition || !cursorShape || !context) {
      return;
    }

    const finePointerQuery = window.matchMedia("(pointer: fine)");
    const reducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const particles: TrailParticle[] = [];
    const lastPointer: Point = { x: -100, y: -100 };
    let hasPointerPosition = false;
    let isVisible = false;
    let animationFrameId = 0;
    let themeFrameId = 0;
    let lastFrameTime = performance.now();
    let pixelRatio = 1;
    let trailColor = "rgb(59 130 246)";

    const updateCursorPosition = (point: Point) => {
      cursorPosition.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;
    };

    const updateThemeColor = () => {
      trailColor = window.getComputedStyle(cursorShape).backgroundColor;
    };

    const resizeCanvas = () => {
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * pixelRatio);
      canvas.height = Math.round(window.innerHeight * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const clearTrail = () => {
      particles.length = 0;
      context.clearRect(
        0,
        0,
        canvas.width / pixelRatio,
        canvas.height / pixelRatio,
      );
    };

    const drawParticle = (particle: TrailParticle) => {
      const progress = particle.age / particle.lifetime;
      const opacity = Math.max(0, 1 - progress) ** 1.35;
      const size = particle.size * (1 - progress * 0.35);

      context.globalAlpha = opacity * 0.94;
      context.fillStyle = trailColor;
      context.beginPath();

      if (particle.isDiamond) {
        context.moveTo(particle.x, particle.y - size);
        context.lineTo(particle.x + size, particle.y);
        context.lineTo(particle.x, particle.y + size);
        context.lineTo(particle.x - size, particle.y);
        context.closePath();
      } else {
        context.arc(particle.x, particle.y, size, 0, Math.PI * 2);
      }

      context.fill();
    };

    const animateTrail = (time: number) => {
      const elapsed = Math.min(time - lastFrameTime, 32);
      lastFrameTime = time;
      context.clearRect(
        0,
        0,
        canvas.width / pixelRatio,
        canvas.height / pixelRatio,
      );

      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        particle.age += elapsed;

        if (particle.age >= particle.lifetime) {
          particles.splice(index, 1);
          continue;
        }

        particle.x += particle.velocityX * elapsed;
        particle.y += particle.velocityY * elapsed;
        drawParticle(particle);
      }

      context.globalAlpha = 1;

      if (particles.length > 0) {
        animationFrameId = window.requestAnimationFrame(animateTrail);
      } else {
        animationFrameId = 0;
      }
    };

    const startTrailAnimation = () => {
      if (animationFrameId === 0) {
        lastFrameTime = performance.now();
        animationFrameId = window.requestAnimationFrame(animateTrail);
      }
    };

    const emitTrail = (from: Point, to: Point) => {
      if (reducedMotionQuery.matches) {
        return;
      }

      const trailFrom = {
        x: from.x + TRAIL_ORIGIN_OFFSET.x,
        y: from.y + TRAIL_ORIGIN_OFFSET.y,
      };
      const trailTo = {
        x: to.x + TRAIL_ORIGIN_OFFSET.x,
        y: to.y + TRAIL_ORIGIN_OFFSET.y,
      };
      const distance = distanceBetween(trailFrom, trailTo);

      if (distance < 0.5) {
        return;
      }

      const count = Math.min(
        MAX_PARTICLES_PER_MOVE,
        Math.ceil(distance / PARTICLE_SPACING),
      );
      const directionX = (trailTo.x - trailFrom.x) / distance;
      const directionY = (trailTo.y - trailFrom.y) / distance;

      for (let index = 1; index <= count; index += 1) {
        const distanceFromStart = (distance * index) / count;
        const baseOffset =
          (Math.random() * 2 - 1) * TRAIL_BASE_HALF_WIDTH;
        const jitter = (Math.random() - 0.5) * 5;
        const particle: TrailParticle = {
          x:
            trailFrom.x +
            directionX * distanceFromStart +
            baseOffset -
            directionY * jitter,
          y:
            trailFrom.y +
            directionY * distanceFromStart +
            directionX * jitter,
          velocityX: (Math.random() - 0.5) * 0.012,
          velocityY: 0.006 + Math.random() * 0.014,
          age: 0,
          lifetime: 460 + Math.random() * 380,
          size: 1.2 + Math.random() * 1.85,
          isDiamond: Math.random() > 0.72,
        };

        particles.push(particle);
      }

      if (particles.length > MAX_PARTICLES) {
        particles.splice(0, particles.length - MAX_PARTICLES);
      }

      startTrailAnimation();
    };

    const hideCursor = () => {
      isVisible = false;
      hasPointerPosition = false;
      layer.dataset.visible = "false";
      layer.dataset.pressed = "false";
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = 0;
      clearTrail();
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

      const pointer = { x: event.clientX, y: event.clientY };

      if (hasPointerPosition) {
        emitTrail(lastPointer, pointer);
      }

      lastPointer.x = pointer.x;
      lastPointer.y = pointer.y;
      hasPointerPosition = true;
      updateCursorPosition(pointer);
      layer.dataset.interactive = String(
        Boolean(element?.closest(INTERACTIVE_SELECTOR)),
      );

      if (!isVisible) {
        isVisible = true;
        layer.dataset.visible = "true";
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

    const handleReducedMotionChange = () => {
      if (reducedMotionQuery.matches) {
        clearTrail();
      }
    };

    const themeObserver = new MutationObserver(() => {
      window.cancelAnimationFrame(themeFrameId);
      themeFrameId = window.requestAnimationFrame(updateThemeColor);
    });

    resizeCanvas();
    updateThemeColor();
    handlePointerCapabilityChange();
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    window.addEventListener("resize", resizeCanvas, { passive: true });
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
    reducedMotionQuery.addEventListener("change", handleReducedMotionChange);

    return () => {
      hideCursor();
      themeObserver.disconnect();
      window.cancelAnimationFrame(themeFrameId);
      delete document.documentElement.dataset.customCursor;
      window.removeEventListener("resize", resizeCanvas);
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
      reducedMotionQuery.removeEventListener(
        "change",
        handleReducedMotionChange,
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
      <canvas ref={trailCanvasRef} className="custom-cursor-trail" />
      <span ref={cursorPositionRef} className="custom-cursor-position">
        <span ref={cursorShapeRef} className="custom-cursor-shape" />
      </span>
    </div>
  );
}
