"use client";

import { FlaskConical } from "lucide-react";

import { messages } from "@/shared/config/translations";
import { usePreferencesStore } from "@/shared/store/preferences-store";

export function LaboratoriesContent() {
  const locale = usePreferencesStore((state) => state.locale);
  const copy = messages[locale].laboratoriesPage;

  return (
    <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-6xl px-6 py-12 sm:py-16">
      <section className="space-y-10" aria-labelledby="laboratories-title">
        <div className="max-w-3xl space-y-3">
          <p className="text-sm font-medium text-primary">{copy.eyebrow}</p>
          <h1
            id="laboratories-title"
            className="text-4xl font-semibold tracking-tight sm:text-5xl"
          >
            {copy.title}
          </h1>
          <p className="text-lg text-muted-foreground">{copy.description}</p>
        </div>

        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 px-6 text-center">
          <FlaskConical
            aria-hidden="true"
            className="mb-4 size-9 text-primary"
          />
          <h2 className="text-lg font-semibold">{copy.emptyTitle}</h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            {copy.emptyDescription}
          </p>
        </div>
      </section>
    </main>
  );
}
