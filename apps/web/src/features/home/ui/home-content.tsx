"use client";

import Image from "next/image";
import Link from "next/link";
import {
  AnimatePresence,
  motion,
  MotionConfig,
  useReducedMotion,
} from "motion/react";
import type { Variants } from "motion/react";
import { useCallback, useEffect, useState } from "react";

import { SplineHeroScene } from "@/features/home/ui/spline-hero-scene";
import { messages } from "@/shared/config/translations";
import { usePreferencesStore } from "@/shared/store/preferences-store";

const textContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { delayChildren: 0.18, staggerChildren: 0.12 },
  },
};

const textItemVariants: Variants = {
  hidden: { opacity: 0, filter: "blur(8px)", y: 22 },
  visible: {
    opacity: 1,
    filter: "blur(0px)",
    transition: { duration: 0.65, ease: "easeOut" },
    y: 0,
  },
};

const SCENE_LOAD_TIMEOUT_MS = 12_000;

export function HomeContent() {
  const locale = usePreferencesStore((state) => state.locale);
  const copy = messages[locale];
  const shouldReduceMotion = useReducedMotion();
  const [isSceneReady, setIsSceneReady] = useState(false);

  const handleSceneReady = useCallback(() => setIsSceneReady(true), []);

  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => setIsSceneReady(true),
      SCENE_LOAD_TIMEOUT_MS,
    );

    return () => window.clearTimeout(timeoutId);
  }, []);

  const motionInitial = shouldReduceMotion ? false : "hidden";

  return (
    <MotionConfig reducedMotion="user">
      <main
        aria-busy={!isSceneReady}
        className="relative min-h-[calc(100vh-4rem)] overflow-x-clip"
      >
        <AnimatePresence>
          {isSceneReady ? null : (
            <motion.div
              aria-label={copy.pageLoading}
              className="fixed inset-0 z-[100] grid place-items-center bg-background"
              exit={{ opacity: 0 }}
              initial={{ opacity: 1 }}
              role="status"
              transition={{ duration: shouldReduceMotion ? 0 : 0.45 }}
            >
              <div className="flex flex-col items-center gap-5">
                <motion.div
                  animate={
                    shouldReduceMotion
                      ? undefined
                      : { opacity: [0.65, 1, 0.65], scale: [0.98, 1.04, 0.98] }
                  }
                  transition={{
                    duration: 1.4,
                    ease: "easeInOut",
                    repeat: Infinity,
                  }}
                >
                  <Image
                    alt=""
                    className="size-16 rounded-2xl border object-cover shadow-lg"
                    height={64}
                    priority
                    src="/assets/header-icon/header.png"
                    width={64}
                  />
                </motion.div>
                <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    animate={
                      shouldReduceMotion
                        ? { width: "100%" }
                        : { x: ["-100%", "240%"] }
                    }
                    className="h-full w-1/2 rounded-full bg-primary"
                    transition={{
                      duration: 1.1,
                      ease: "easeInOut",
                      repeat: Infinity,
                    }}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <section className="relative isolate min-h-[calc(100vh-4rem)] overflow-hidden">
          <motion.div
            animate={{ opacity: isSceneReady ? 1 : 0 }}
            className="pointer-events-none absolute inset-0 -z-20"
            initial={{ opacity: 0 }}
            transition={{
              duration: shouldReduceMotion ? 0 : 0.8,
              ease: "easeOut",
            }}
          >
            <SplineHeroScene
              label={copy.sceneLabel}
              onReady={handleSceneReady}
            />
          </motion.div>

          <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-7xl items-center px-6 py-12 sm:py-16 lg:py-20">
            <motion.div
              animate={isSceneReady ? "visible" : "hidden"}
              className="relative z-10 min-w-0 max-w-2xl lg:max-w-[38rem]"
              initial={motionInitial}
              variants={textContainerVariants}
            >
              <motion.h1
                className="max-w-[14ch] text-4xl font-semibold tracking-[-0.035em] text-white text-shadow-lg/30 text-shadow-black text-balance sm:text-5xl lg:text-6xl xl:text-7xl"
                variants={textItemVariants}
              >
                {copy.title}
              </motion.h1>

              <motion.p
                className="mt-6 max-w-xl text-base leading-7 text-white/85 text-shadow-md text-shadow-black sm:text-lg"
                variants={textItemVariants}
              >
                {copy.description}
              </motion.p>

              <motion.div
                className="mt-8 flex flex-wrap items-center gap-3"
                variants={textItemVariants}
              >
                <Link
                  className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none"
                  href="/laboratorios"
                >
                  {copy.primaryAction}
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>
      </main>
    </MotionConfig>
  );
}
