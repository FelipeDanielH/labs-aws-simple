"use client";

import Link from "next/link";
import { motion, MotionConfig, useReducedMotion } from "motion/react";
import type { Variants } from "motion/react";

import { SplineHeroScene } from "@/features/home/ui/spline-hero-scene";
import { messages } from "@/shared/config/translations";
import { usePreferencesStore } from "@/shared/store/preferences-store";

const textContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { delayChildren: 0.12, staggerChildren: 0.1 },
  },
};

const textItemVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
};

export function HomeContent() {
  const locale = usePreferencesStore((state) => state.locale);
  const copy = messages[locale];
  const shouldReduceMotion = useReducedMotion();

  const motionInitial = shouldReduceMotion ? false : "hidden";

  return (
    <MotionConfig reducedMotion="user">
      <main className="relative min-h-[calc(100vh-4rem)] overflow-x-clip">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-[-12rem] right-[-10rem] size-[34rem] rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute bottom-[-14rem] left-[-12rem] size-[30rem] rounded-full bg-primary/5 blur-3xl" />
        </div>

        <section className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-7xl items-center gap-10 px-6 py-10 sm:py-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12 lg:py-16 xl:gap-16">
          <motion.div
            animate="visible"
            className="relative z-10 min-w-0 max-w-2xl"
            initial={motionInitial}
            variants={textContainerVariants}
          >
            <motion.p
              className="mb-5 inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1.5 text-sm font-medium text-primary shadow-sm backdrop-blur"
              variants={textItemVariants}
            >
              <span className="size-2 rounded-full bg-primary" />
              {copy.eyebrow}
            </motion.p>

            <motion.h1
              className="max-w-[14ch] text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl lg:text-6xl xl:text-7xl"
              variants={textItemVariants}
            >
              {copy.title}
            </motion.h1>

            <motion.p
              className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg"
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

          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative min-w-0 overflow-hidden rounded-[2rem] border bg-card/50 shadow-2xl shadow-primary/10"
            initial={
              shouldReduceMotion ? false : { opacity: 0, scale: 0.97, y: 24 }
            }
            transition={{ delay: 0.2, duration: 0.7, ease: "easeOut" }}
          >
            <div className="aspect-[5/4] w-full min-w-0 sm:aspect-[16/11] lg:aspect-auto lg:h-[min(66vh,42rem)] lg:min-h-[31rem]">
              <SplineHeroScene
                label={copy.sceneLabel}
                loadingLabel={copy.sceneLoading}
              />
            </div>
          </motion.div>
        </section>
      </main>
    </MotionConfig>
  );
}
