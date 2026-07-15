import type { Metadata } from "next";

import { LaboratoriesContent } from "@/features/laboratories/ui/laboratories-content";

export const metadata: Metadata = {
  title: "Laboratorios | AWS Labs",
  description: "Catálogo de laboratorios y entregables de AWS Labs.",
};

export default function LaboratoriesPage() {
  return <LaboratoriesContent />;
}
