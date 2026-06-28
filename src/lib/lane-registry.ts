import { runNewsLane } from "@/agents/lanes/news";
import { runAnalystLane } from "@/agents/lanes/analyst";
import { runSubstackLane } from "@/agents/lanes/substack";
import { runMediumLane } from "@/agents/lanes/medium";
import { runXLane } from "@/agents/lanes/x";
import { runLinkedInLane } from "@/agents/lanes/linkedin";
import type { LaneResult, PipelineContext } from "@/types";

/** Canonical six research lanes — order used in stats display */
export const RESEARCH_LANE_IDS = [
  "news",
  "analyst",
  "substack",
  "medium",
  "x",
  "linkedin",
] as const;

export type ResearchLaneId = (typeof RESEARCH_LANE_IDS)[number];

export const RESEARCH_LANE_LABELS: Record<ResearchLaneId, string> = {
  news: "News",
  analyst: "Analyst",
  substack: "Substack",
  medium: "Medium",
  x: "X",
  linkedin: "LinkedIn",
};

type LaneRunner = (ctx: PipelineContext) => Promise<LaneResult>;

export interface RegisteredLane {
  id: ResearchLaneId;
  label: string;
  implemented: true;
  wired: true;
  source: "exa" | "apify";
  runner: LaneRunner;
}

/** All six lanes are implemented and registered with CHIEF. */
export const LANE_REGISTRY: RegisteredLane[] = [
  {
    id: "news",
    label: "News",
    implemented: true,
    wired: true,
    source: "exa",
    runner: runNewsLane,
  },
  {
    id: "analyst",
    label: "Analyst",
    implemented: true,
    wired: true,
    source: "exa",
    runner: runAnalystLane,
  },
  {
    id: "substack",
    label: "Substack",
    implemented: true,
    wired: true,
    source: "exa",
    runner: runSubstackLane,
  },
  {
    id: "medium",
    label: "Medium",
    implemented: true,
    wired: true,
    source: "exa",
    runner: runMediumLane,
  },
  {
    id: "x",
    label: "X",
    implemented: true,
    wired: true,
    source: "apify",
    runner: runXLane,
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    implemented: true,
    wired: true,
    source: "apify",
    runner: runLinkedInLane,
  },
];
