export async function adminRequest<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: init?.cache ?? "no-store",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    issues?: Array<{ message?: string }>;
  } & T;
  if (!response.ok) {
    const issueMessage = body.issues
      ?.map((issue) => issue.message)
      .filter((message): message is string => Boolean(message))
      .filter((message, index, messages) => messages.indexOf(message) === index)
      .join(" ");
    throw new Error(
      issueMessage || body.error || "La operación no pudo completarse.",
    );
  }
  return body;
}
