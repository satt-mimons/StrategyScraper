/**
 * Sentinel written to runs.error when a user presses "Stop generating". Both the DELETE
 * handler and the pipeline's own cancellation checkpoint use this exact string so the UI can
 * tell a user-initiated stop apart from a real failure.
 */
export const STOPPED_BY_USER = "Stopped by you.";

/** Maps internal pipeline error strings to plain-English copy safe to show end users. */
export function friendlyGenerationError(rawError: string | null | undefined): string {
  const raw = rawError ?? "";

  // A user-initiated stop is already plain English — surface it verbatim, don't dress it up
  // as an error.
  if (raw === STOPPED_BY_USER) return STOPPED_BY_USER;

  if (/lanes failed|no candidates collected/i.test(raw)) {
    return "We couldn't find enough relevant articles for this run. Try widening your topics, or check back later.";
  }
  if (/produced zero distinct stories|selected zero stories/i.test(raw)) {
    return "We found articles but couldn't assemble enough distinct, relevant stories. Try adding more topics.";
  }
  if (/cost cap|cost limit/i.test(raw)) {
    return "This run exceeded the cost safety limit and was stopped automatically.";
  }
  if (/timed out/i.test(raw)) {
    return "Generation took too long and timed out. Please try again.";
  }
  return "Something went wrong while generating this newsletter.";
}
