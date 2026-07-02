/**
 * Shared authorization for cron endpoints. Vercel Cron attaches `Authorization: Bearer <secret>`
 * (from the CRON_SECRET env var) to every scheduled invocation; the internal dispatch→worker
 * fan-out attaches the same header. We fail loudly if the secret isn't configured rather than
 * silently accepting unauthenticated requests.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error("CRON_SECRET is not set — cron endpoints cannot authenticate requests.");
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
