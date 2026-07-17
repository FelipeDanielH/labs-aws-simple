import { injectControlledBase } from "@/features/content-management/application/html-content";
import { getContentRepository } from "@/features/content-management/server/container";
import { isContentLocale } from "@/shared/config/locale-routing";

type Context = { params: Promise<{ locale: string; slug: string }> };
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: Context) {
  const { locale, slug } = await context.params;
  if (!isContentLocale(locale)) {
    return new Response("Contenido no encontrado", { status: 404 });
  }
  const document = await getContentRepository()
    .findPublishedBySlug(slug, locale)
    .catch(() => null);
  if (!document || document.entry.content.kind !== "html") {
    return new Response("Contenido no encontrado", { status: 404 });
  }
  const baseUrl =
    document.entry.content.assetBaseUrl ?? document.entry.content.url;
  return new Response(injectControlledBase(document.source, baseUrl), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": [
        "default-src 'none'",
        "script-src 'none'",
        "connect-src 'none'",
        "form-action 'none'",
        "frame-src 'none'",
        "frame-ancestors 'self'",
        "base-uri https:",
        "img-src https:",
        "style-src https: 'unsafe-inline'",
        "font-src https:",
        "navigate-to 'none'",
      ].join("; "),
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    },
  });
}
