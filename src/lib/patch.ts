/**
 * Deterministic patch application for the editor agent (§10).
 *
 * The editor no longer regenerates the whole newsletter; it returns a list of targeted
 * find/replace operations and we apply them here in code. This keeps the editor's output
 * small (a few spans, not ~2000 words) so its LLM call is fast, while the actual document
 * mutation stays deterministic and auditable.
 */
export interface EditOp {
  /** An exact, unique substring of the current draft to replace. */
  find: string;
  /** The edited text to substitute in. */
  replace: string;
  /** Why the edit was made (for logging/debugging; not applied). */
  reason?: string;
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

/**
 * Apply editor edit operations to a draft, one at a time, in order.
 *
 * Each `find` is verified against the CURRENT (progressively-mutated) draft: it must occur
 * exactly once. We FAIL LOUDLY (throw) if a `find` is missing or ambiguous rather than
 * silently skipping — a dropped edit would ship unpolished text, and an ambiguous one could
 * corrupt the wrong span. This matches the repo convention: no silent fallbacks.
 */
export function applyEditPatches(draft: string, ops: EditOp[]): string {
  if (!Array.isArray(ops)) {
    throw new Error("Editor did not return an array of edit operations");
  }

  let result = draft;
  ops.forEach((op, i) => {
    if (
      op == null ||
      typeof op.find !== "string" ||
      typeof op.replace !== "string"
    ) {
      throw new Error(
        `Edit op ${i} is malformed (expected string find/replace): ${JSON.stringify(op)}`
      );
    }
    if (op.find === "") {
      throw new Error(`Edit op ${i} has an empty \`find\``);
    }

    const occurrences = countOccurrences(result, op.find);
    if (occurrences === 0) {
      throw new Error(
        `Edit op ${i} \`find\` not found in draft: ${JSON.stringify(preview(op.find))}`
      );
    }
    if (occurrences > 1) {
      throw new Error(
        `Edit op ${i} \`find\` is ambiguous (${occurrences} matches): ${JSON.stringify(preview(op.find))}`
      );
    }

    // split/join instead of String.replace so `$&`, `$1`, etc. in the replacement text are
    // treated literally. We've verified exactly one occurrence, so this replaces just it.
    result = result.split(op.find).join(op.replace);
  });

  return result;
}

function preview(s: string): string {
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}
