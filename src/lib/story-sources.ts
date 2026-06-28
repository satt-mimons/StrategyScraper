import type { Lane, StorySourceType } from "@/types";

/** Map research lane → source-type bucket for clustered stories */
export function classifySourceType(lane: Lane): StorySourceType {
  if (lane === "analyst") return "analyst";
  if (lane === "substack" || lane === "substack-open" || lane === "medium") {
    return "niche_blog";
  }
  return "mainstream";
}

export function uniqueSourceTypes(types: StorySourceType[]): StorySourceType[] {
  const order: StorySourceType[] = ["analyst", "niche_blog", "mainstream"];
  const set = new Set(types);
  return order.filter((t) => set.has(t));
}
