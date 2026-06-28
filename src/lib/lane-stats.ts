import {
  RESEARCH_LANE_IDS,
  RESEARCH_LANE_LABELS,
  type ResearchLaneId,
} from "@/lib/lane-registry";
import type { Candidate, Lane, LaneResult, LaneStatEntry, SelectedStory } from "@/types";

export function emptyLaneStats(): LaneStatEntry[] {
  return RESEARCH_LANE_IDS.map((lane) => ({
    lane,
    raw_count: 0,
    survived_count: 0,
    error: null,
  }));
}

/** Map candidate lane tags to one of the six canonical research lanes. */
export function normalizeLaneForStats(lane: Lane | string): ResearchLaneId | null {
  if (lane === "substack-open") return "substack";
  if (RESEARCH_LANE_IDS.includes(lane as ResearchLaneId)) {
    return lane as ResearchLaneId;
  }
  return null;
}

export function buildRawLaneStats(laneResults: LaneResult[]): LaneStatEntry[] {
  const stats = emptyLaneStats();
  const byLane = new Map(stats.map((s) => [s.lane, s]));

  for (const result of laneResults) {
    const canonical = normalizeLaneForStats(result.lane);
    if (!canonical) continue;

    const entry = byLane.get(canonical)!;
    entry.raw_count += result.candidates.length;
    if (result.error) {
      entry.error = result.error;
    } else if (!result.success && result.candidates.length === 0 && !entry.error) {
      entry.error = "No results returned";
    }
  }

  return stats;
}

export function applySurvivedCounts(
  stats: LaneStatEntry[],
  selectedStories: SelectedStory[]
): LaneStatEntry[] {
  const byLane = new Map(stats.map((s) => [s.lane, { ...s }]));

  for (const story of selectedStories) {
    const canonical = normalizeLaneForStats(story.lane);
    if (!canonical) continue;
    const entry = byLane.get(canonical)!;
    entry.survived_count += 1;
  }

  return RESEARCH_LANE_IDS.map((lane) => byLane.get(lane)!);
}

export function formatLaneStatEntry(entry: LaneStatEntry): string {
  const label = RESEARCH_LANE_LABELS[entry.lane];

  if (entry.error && entry.raw_count === 0) {
    return `${label}: ERROR(${entry.error})`;
  }

  if (entry.raw_count === 0 && !entry.error) {
    return `${label}: 0 fetched`;
  }

  if (entry.survived_count > 0) {
    return `${label}: ${entry.raw_count} fetched / ${entry.survived_count} used`;
  }

  if (entry.error) {
    return `${label}: ${entry.raw_count} fetched / 0 used · ${entry.error}`;
  }

  return `${label}: ${entry.raw_count} fetched / 0 used`;
}

export function formatLaneStatsSummary(stats: LaneStatEntry[]): string {
  return stats.map(formatLaneStatEntry).join(" · ");
}

export function logLaneStats(runId: string, stats: LaneStatEntry[]): void {
  console.log(`[run ${runId.slice(0, 8)}] Lane stats: ${formatLaneStatsSummary(stats)}`);
}

export function countCandidatesByLane(
  candidates: Candidate[]
): Record<ResearchLaneId, number> {
  const counts = Object.fromEntries(
    RESEARCH_LANE_IDS.map((lane) => [lane, 0])
  ) as Record<ResearchLaneId, number>;

  for (const c of candidates) {
    const canonical = normalizeLaneForStats(c.lane);
    if (canonical) counts[canonical] += 1;
  }

  return counts;
}
