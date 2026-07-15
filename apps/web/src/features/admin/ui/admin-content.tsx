"use client";

import { DocumentAdminWorkspace } from "./document-admin-workspace";
import { messages } from "@/shared/config/translations";
import { usePreferencesStore } from "@/shared/store/preferences-store";

export function AdminContent() {
  const locale = usePreferencesStore((state) => state.locale);
  const copy = messages[locale].adminPage;

  return (
    <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-6xl space-y-12 px-6 py-12 sm:py-16">
      <div className="max-w-3xl space-y-3">
        <p className="text-sm font-medium text-primary">{copy.eyebrow}</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {copy.title}
        </h1>
        <p className="text-lg text-muted-foreground">{copy.description}</p>
      </div>
      <DocumentAdminWorkspace />
    </main>
  );
}
