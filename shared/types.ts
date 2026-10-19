// Types shared by the server (agent, engine) and the browser UI.

/** Qloo entity categories this app works with, as short names. */
export type EntityKind =
  | "movie"
  | "tv_show"
  | "artist"
  | "book"
  | "place"
  | "destination"
  | "podcast"
  | "brand"
  | "video_game"
  | "person";

/** A Qloo entity as the UI and the agent see it (normalised from the API). */
export interface EntityCard {
  id: string;
  name: string;
  kind: EntityKind;
  /** Short context line: year, neighbourhood, author, etc. */
  subtitle?: string;
  image?: string;
  popularity?: number;
  /** Place-only details. */
  priceLevel?: number;
  address?: string;
  neighborhood?: string;
  city?: string;
  rating?: number;
  /** Up to ~8 readable tags from Qloo. */
  tags?: TagRef[];
  description?: string;
}

export interface TagRef {
  id: string;
  name: string;
  type?: string;
}

export interface Person {
  id: string;
  name: string;
  /** Index into the UI palette; the server never needs it. */
  color: number;
  likes: EntityCard[];
}

export type SlotKind = "dinner" | "drinks" | "movie" | "series" | "music" | "book" | "trip";

export const SLOT_LABELS: Record<SlotKind, string> = {
  dinner: "Dinner",
  drinks: "Drinks",
  movie: "Movie",
  series: "Series",
  music: "Music",
  book: "Book",
  trip: "Weekend trip",
};

/** Slots that need a city or neighbourhood. */
export const LOCATED_SLOTS: SlotKind[] = ["dinner", "drinks"];

/** What the browser sends to POST /api/plan. */
export interface PlanRequestBody {
  group: Person[];
  slots: SlotKind[];
  location?: string;
  notes?: string;
  /** A follow-up message in an existing conversation ("cheaper", "Jun is vegetarian"). */
  message?: string;
  /** Opaque agent state returned by the previous run (provider-native messages). */
  history?: AgentHistory;
  /** Entity ids the group vetoed, by slot. */
  vetoes?: Partial<Record<SlotKind, string[]>>;
  /** Mean satisfaction each person got in earlier accepted plans (0..1). */
  ledger?: Record<string, number[]>;
}

export interface AgentHistory {
  provider: string;
  model: string;
  messages: unknown[];
  /** Server-side tool state the agent refers to (slot results by ref). */
  memo?: unknown;
}

/** One candidate scored for every person. Percentiles are 0..1 (1 = that person's top pick in the pool). */
export interface ScoredCandidate {
  ref: string;
  entity: EntityCard;
  percentiles: Record<string, number>;
  /** 1-based rank of this candidate in each person's own ordering of the pool. */
  ranks: Record<string, number>;
  /** Weighted geometric mean of percentiles (multiplicative aggregation). */
  groupScore: number;
  minPercentile: number;
  /** True if nobody falls below the misery floor. */
  fair: boolean;
  /** Share of the group request's explainability that came from each person (sums to ~1). */
  attribution: Record<string, number>;
  /** The liked entities that pulled this candidate up, strongest first. */
  drivers: Array<{ personId: string; entityId: string; entityName: string; weight: number }>;
  /** Shared-taste tags this candidate carries. */
  matchedTags: Array<{ id: string; name: string; personIds: string[] }>;
}

export interface SlotResult {
  slot: SlotKind;
  location?: string;
  poolSize: number;
  floor: number;
  candidates: ScoredCandidate[];
  /** The most popular option in the pool, for comparison. */
  popularBaseline?: ScoredCandidate;
  /** Each person's own number one in the pool. */
  personalTop: Record<string, { entityId: string; name: string }>;
  weights: Record<string, number>;
  notes: string[];
  filters: Record<string, string | number>;
}

export interface TasteTag {
  id: string;
  name: string;
  type?: string;
  /** 0..1 per person, rank-normalised across the union of tags. */
  byPerson: Record<string, number>;
}

export interface GroupTaste {
  people: Array<{ personId: string; topTags: Array<{ id: string; name: string; score: number }> }>;
  shared: TasteTag[];
  tensions: Array<TasteTag & { champion: string }>;
  /** Pairwise compare from /v2/analysis/compare (two-person groups only). */
  pairShared?: Array<{ id: string; name: string; score: number }>;
}

export interface PlanItem {
  slot: SlotKind;
  pick: ScoredCandidate;
  alternatives: ScoredCandidate[];
  why: string;
  tradeoff?: string;
}

export interface Plan {
  title: string;
  summary: string;
  items: PlanItem[];
  noteForGroup?: string;
  weights: Record<string, number>;
  createdAt: string;
}

export interface QlooReceipt {
  id: number;
  path: string;
  params: Record<string, string>;
  status: number | "error" | "mock";
  ms: number;
  results: number;
  cached: boolean;
  purpose?: string;
}

export interface RunStatus {
  qloo: "live" | "mock";
  llm: string;
  model?: string;
  notice?: string;
}

/** Events streamed from POST /api/plan as newline-delimited JSON. */
export type PlanEvent =
  | { type: "status"; status: RunStatus }
  | { type: "step"; id: string; label: string; detail?: string; state: "running" | "done" | "error" }
  | { type: "thinking"; text: string }
  | { type: "qloo"; receipt: QlooReceipt }
  | { type: "taste"; taste: GroupTaste }
  | { type: "slot"; result: SlotResult }
  | { type: "plan"; plan: Plan }
  | { type: "message"; text: string }
  | { type: "history"; history: AgentHistory }
  | { type: "error"; message: string }
  | { type: "done" };

export interface SearchResponse {
  results: EntityCard[];
  mode: "live" | "mock";
}

export interface HealthResponse {
  ok: boolean;
  qloo: "live" | "mock";
  llm: string;
  model?: string;
}
