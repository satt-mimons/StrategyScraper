import type { LinkTier, SelectedStory } from "@/types";

function linkLabel(story: SelectedStory): string {
  const label = story.title || story.url;
  if (story.is_paywalled) {
    return `${label} (paywalled)`;
  }
  return label;
}

function sortByTier(stories: SelectedStory[]): SelectedStory[] {
  const tierOrder: Record<LinkTier, number> = { must_read: 0, context: 1 };
  return [...stories].sort(
    (a, b) => tierOrder[a.link_tier ?? "context"] - tierOrder[b.link_tier ?? "context"]
  );
}

/**
 * Deterministic "Further Reading" — grouped by topic, must_read first and marked.
 */
export function buildFurtherReadingSection(
  stories: SelectedStory[],
  topics: string[]
): string {
  const lines: string[] = ["## Further Reading", ""];

  const byTopic = new Map<string, SelectedStory[]>();
  for (const topic of topics) {
    byTopic.set(topic, []);
  }
  for (const story of stories) {
    const topic = story.primary_topic ?? topics[0] ?? "General";
    if (!byTopic.has(topic)) {
      byTopic.set(topic, []);
    }
    byTopic.get(topic)!.push(story);
  }

  let hasAny = false;

  for (const topic of topics) {
    const topicStories = sortByTier(byTopic.get(topic) ?? []);
    if (topicStories.length === 0) continue;

    hasAny = true;
    lines.push(`### ${topic}`, "");

    const mustRead = topicStories.filter((s) => s.link_tier === "must_read");
    const context = topicStories.filter((s) => s.link_tier === "context");

    if (mustRead.length > 0) {
      lines.push("**Must read**", "");
      for (const s of mustRead) {
        lines.push(`- [${linkLabel(s)}](${s.url})`);
      }
      lines.push("");
    }

    if (context.length > 0) {
      lines.push("**Context**", "");
      for (const s of context) {
        lines.push(`- [${linkLabel(s)}](${s.url})`);
      }
      lines.push("");
    }
  }

  if (!hasAny) {
    return "";
  }

  return lines.join("\n").trim();
}

/** Remove legacy flat SOURCES / Sources sections before appending Further Reading. */
export function stripFlatSourcesSection(markdown: string): string {
  return markdown.replace(
    /\n##\s+(SOURCES|Sources|Source List|References)\s*\n[\s\S]*$/i,
    ""
  ).trim();
}

export function appendFurtherReading(
  markdown: string,
  stories: SelectedStory[],
  topics: string[]
): string {
  const body = stripFlatSourcesSection(markdown);
  const section = buildFurtherReadingSection(stories, topics);
  if (!section) return body;
  return `${body}\n\n${section}`;
}
