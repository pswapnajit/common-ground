// Group-decision maths. Pure functions, no I/O.
//
// Qloo affinity scores from separate requests are not on a common scale, so
// each person's scores are first turned into percentiles within one shared
// shortlist. The group score is then a weighted geometric mean of those
// percentiles ("multiplicative" aggregation in the group-recommender
// literature): one unhappy person pulls it down hard, which is the point.
// A misery floor removes options that leave anyone near the bottom of their
// own list ("average without misery").

export interface Ranking {
  percentile: Map<string, number>;
  rank: Map<string, number>;
  missing: string[];
}

/**
 * Percentile of each pool item for one person. Higher affinity = higher
 * percentile; ties share the average rank; items Qloo didn't score rank last.
 */
export function rankWithinPool(poolIds: string[], scores: Map<string, number | null | undefined>): Ranking {
  const scored = poolIds.filter((id) => typeof scores.get(id) === "number");
  const missing = poolIds.filter((id) => typeof scores.get(id) !== "number");
  scored.sort((a, b) => (scores.get(b) as number) - (scores.get(a) as number));
  const n = poolIds.length;
  const rank = new Map<string, number>();
  let i = 0;
  while (i < scored.length) {
    let j = i;
    while (j + 1 < scored.length && scores.get(scored[j + 1]) === scores.get(scored[i])) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) rank.set(scored[k], avg);
    i = j + 1;
  }
  for (const id of missing) rank.set(id, n);
  const percentile = new Map<string, number>();
  for (const id of poolIds) {
    const r = rank.get(id)!;
    const p = n <= 1 ? 1 : 1 - (r - 1) / (n - 1);
    percentile.set(id, missing.includes(id) ? 0 : Math.round(p * 1000) / 1000);
  }
  return { percentile, rank, missing };
}

/**
 * Fairness ledger: people who got less out of earlier plans get a slightly
 * bigger say now. Input is each person's mean satisfaction (0..1) per past
 * plan. Weights average to 1 and stay within [0.75, 1.5].
 */
export function ledgerWeights(personIds: string[], ledger?: Record<string, number[]>): Record<string, number> {
  const recent = (id: string) => (ledger?.[id] ?? []).slice(-5);
  const means = personIds.map((id) => {
    const xs = recent(id);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;
  });
  const known = means.filter((m): m is number => m !== undefined);
  if (known.length < 2) return Object.fromEntries(personIds.map((id) => [id, 1]));
  const groupMean = known.reduce((a, b) => a + b, 0) / known.length;
  const raw = means.map((m) => (m === undefined ? 1 : Math.min(1.5, Math.max(0.75, 1 + 1.6 * (groupMean - m)))));
  const avg = raw.reduce((a, b) => a + b, 0) / raw.length;
  return Object.fromEntries(personIds.map((id, i) => [id, Math.round((raw[i] / avg) * 100) / 100]));
}

const EPS = 0.02;

/** Weighted geometric mean of percentiles, scaled so all-1s gives 1. */
export function groupScore(percentiles: number[], weights: number[]): number {
  if (!percentiles.length) return 0;
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  const logSum = percentiles.reduce((s, p, i) => s + weights[i] * Math.log((EPS + Math.max(0, p)) / (1 + EPS)), 0);
  return Math.round(Math.exp(logSum / wsum) * 1000) / 1000;
}

export const FLOOR_LEVELS = [0.4, 0.3, 0.2, 0.1, 0];

/** The highest misery floor that still leaves at least `minPassing` options. */
export function chooseFloor(minPercentiles: number[], minPassing = 3): number {
  const need = Math.min(minPassing, minPercentiles.length);
  for (const floor of FLOOR_LEVELS) {
    if (minPercentiles.filter((m) => m >= floor).length >= need) return floor;
  }
  return 0;
}

export interface Rankable {
  id: string;
  percentiles: Record<string, number>;
  popularity?: number;
}

export interface Ranked<T> {
  item: T;
  groupScore: number;
  minPercentile: number;
  fair: boolean;
}

/** Orders options: those above the misery floor first, each block by group score. */
export function rankForGroup<T extends Rankable>(
  items: T[],
  personIds: string[],
  weights: Record<string, number>,
  floor?: number,
): { ranked: Array<Ranked<T>>; floor: number } {
  const rows = items.map((item) => {
    const ps = personIds.map((id) => item.percentiles[id] ?? 0);
    return {
      item,
      groupScore: groupScore(ps, personIds.map((id) => weights[id] ?? 1)),
      minPercentile: ps.length ? Math.min(...ps) : 0,
    };
  });
  const f = floor ?? chooseFloor(rows.map((r) => r.minPercentile));
  const ranked = rows
    .map((r) => ({ ...r, fair: r.minPercentile >= f }))
    .sort(
      (a, b) =>
        Number(b.fair) - Number(a.fair) ||
        b.groupScore - a.groupScore ||
        b.minPercentile - a.minPercentile ||
        (b.item.popularity ?? 0) - (a.item.popularity ?? 0),
    );
  return { ranked, floor: f };
}

/**
 * Splits credit for a recommendation between people, using Qloo's
 * explainability scores for each input entity. An entity liked by several
 * people is shared between them.
 */
export function attribute(
  explain: Map<string, number>,
  owners: Map<string, string[]>,
  personIds: string[],
): Record<string, number> {
  const totals: Record<string, number> = Object.fromEntries(personIds.map((id) => [id, 0]));
  for (const [entityId, score] of explain) {
    const who = owners.get(entityId);
    if (!who?.length) continue;
    for (const p of who) if (p in totals) totals[p] += score / who.length;
  }
  const sum = Object.values(totals).reduce((a, b) => a + b, 0);
  if (sum <= 0) return {};
  return Object.fromEntries(personIds.map((id) => [id, Math.round((totals[id] / sum) * 100) / 100]));
}

/** Mean percentile each person got across a plan's picks (for the ledger). */
export function satisfaction(picks: Array<Record<string, number>>, personIds: string[]): Record<string, number> {
  return Object.fromEntries(
    personIds.map((id) => {
      const xs = picks.map((p) => p[id]).filter((x): x is number => typeof x === "number");
      return [id, xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000 : 0];
    }),
  );
}
