import { getContentRepository } from "@/features/content-management/server/container";
import { injectControlledBase } from "@/features/content-management/application/html-content";

type Context = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: Context) {
  const { slug } = await context.params;
  const document = await getContentRepository()
    .findPublishedBySlug(slug)
    .catch(() => null);
  if (!document || document.entry.content.kind !== "html") {
    return new Response("Contenido no encontrado", { status: 404 });
  }
  const baseUrl =
    document.entry.content.assetBaseUrl ??
    new URL(`/${document.entry.folder}/assets/`, document.entry.content.url)
      .href;
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
