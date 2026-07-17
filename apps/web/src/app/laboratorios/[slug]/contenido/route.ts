type Context = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: Context) {
  const { slug } = await context.params;
  return Response.redirect(
    new URL(`/es/laboratorios/${slug}/contenido`, request.url),
    308,
  );
}
