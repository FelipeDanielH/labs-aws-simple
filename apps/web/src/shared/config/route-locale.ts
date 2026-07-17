import { notFound } from "next/navigation";

import type { ContentLocale } from "@/features/content-management/domain/models";
import { isContentLocale } from "@/shared/config/locale-routing";

export function assertContentLocale(
  value: string,
): asserts value is ContentLocale {
  if (!isContentLocale(value)) notFound();
}
