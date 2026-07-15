export const DOCUMENT_CLEANUP_GRACE_PERIOD_MS = 10 * 60 * 1000;

export function cleanupRemainingMinutes(
  updatedAt: string,
  now = Date.now(),
): number {
  const availableAt =
    new Date(updatedAt).getTime() + DOCUMENT_CLEANUP_GRACE_PERIOD_MS;
  return Math.max(0, Math.ceil((availableAt - now) / 60_000));
}
