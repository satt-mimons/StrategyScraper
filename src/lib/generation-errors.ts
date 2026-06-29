/** Maps internal pipeline error strings to plain-English copy safe to show end users. */
export function friendlyGenerationError(rawError: string | null | undefined): string {
  const raw = rawError ?? "";

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
