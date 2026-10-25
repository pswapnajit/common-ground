// Plans one item (dinner, a movie, ...) for a group:
//   1. candidates: one Qloo request with everyone's favourites as signals
//      (with explainability), plus one per person so nobody's taste is missing;
//   2. scores: one request per person with filter.results.entities = the
//      shared shortlist, turned into within-shortlist percentiles;
//   3. a fair ranking (misery floor + weighted geometric mean).

import type { EntityCard, Person, ScoredCandidate, SlotKind, SlotResult, TasteTag } from "../../shared/types.js";
import { QlooError, type Qloo, type QlooParams } from "../qloo/client.js";
import { attribute, rankForGroup, rankWithinPool } from "./fairness.js";
import { SLOTS, resolveCategoryTag } from "./slots.js";

export interface PlanSlotInput {
  slot: SlotKind;
  group: Person[];
  location?: string;
  includeTagIds?: string[];
  includeMode?: "all" | "any";
  excludeTagIds?: string[];
  priceMax?: number;
  priceMin?: number;
  contentRatings?: string[];
  releaseYearMin?: number;
  releaseYearMax?: number;
  excludeEntityIds?: string[];
  weights?: Record<string, number>;
  sharedTags?: TasteTag[];
  /** How many ranked options to return. */
  keep?: number;
}

// Film and TV records are heavy (many localised titles), so scoring a long
// shortlist is slow; 32 keeps a plan in the seconds range.
const POOL_MAX_MEDIA = 32;
const POOL_MAX_PLACES = 40;

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

export async function planSlot(qloo: Qloo, input: PlanSlotInput): Promise<SlotResult> {
  const def = SLOTS[input.slot];
  const people = input.group.filter((p) => p.likes.length > 0);
  const personIds = people.map((p) => p.id);
  const notes: string[] = [];
  const weights = Object.fromEntries(personIds.map((id) => [id, input.weights?.[id] ?? 1]));
  const empty = (extra: string): SlotResult => ({
    slot: input.slot,
    location: input.location,
    poolSize: 0,
    floor: 0,
    candidates: [],
    personalTop: {},
    weights,
    notes: [...notes, extra],
    filters: {},
  });
  if (!people.length) return empty("Nobody in the group has added any favourites yet.");

  // Who liked what (an entity can be liked by several people).
  const owners = new Map<string, string[]>();
  const likeNames = new Map<string, string>();
  for (const p of people) {
    for (const l of p.likes) {
      owners.set(l.id, unique([...(owners.get(l.id) ?? []), p.id]));
      likeNames.set(l.id, l.name);
    }
  }
  const allLikes = [...owners.keys()];

  // Shared filters for this item.
  const base: QlooParams = { "filter.type": def.filterType };
  const filtersShown: Record<string, string | number> = {};
  const categoryTag = await resolveCategoryTag(qloo, def);
  const include = input.includeTagIds?.filter(Boolean) ?? [];
  if (input.includeMode === "any" && include.length) {
    base["filter.tags"] = include;
    base["operator.filter.tags"] = "union";
  } else if (!include.length && def.unionTags?.length) {
    base["filter.tags"] = def.unionTags;
    base["operator.filter.tags"] = "union";
  } else if (categoryTag || include.length) {
    base["filter.tags"] = unique([...(categoryTag ? [categoryTag] : []), ...include]);
    base["operator.filter.tags"] = "intersection";
  }
  if (def.category && !categoryTag) notes.push(`Couldn't resolve a Qloo category tag for "${def.category.query}", so results may include other kinds of places.`);
  if (input.excludeTagIds?.length) {
    base["filter.exclude.tags"] = input.excludeTagIds;
    base["operator.filter.exclude.tags"] = "union";
  }
  if (def.needsLocation) {
    const where = input.location?.trim() || "New York City";
    base["filter.location.query"] = where;
    filtersShown.location = where;
  }
  if (def.filterType === "urn:entity:place") {
    if (input.priceMax) base["filter.price_level.max"] = input.priceMax;
    if (input.priceMin) base["filter.price_level.min"] = input.priceMin;
  }
  if (def.filterType === "urn:entity:movie" || def.filterType === "urn:entity:tv_show") {
    if (input.contentRatings?.length) base["filter.content_rating"] = input.contentRatings.join(",");
    if (input.releaseYearMin) base["filter.release_year.min"] = input.releaseYearMin;
    if (input.releaseYearMax) base["filter.release_year.max"] = input.releaseYearMax;
  }
  const exclude = unique([...allLikes, ...(input.excludeEntityIds ?? [])]);
  base["filter.exclude.entities"] = exclude;
  for (const [k, v] of Object.entries(base)) {
    if (k === "filter.exclude.entities" || v === undefined) continue;
    filtersShown[k] = k === "filter.tags" && v === def.unionTags ? `${def.unionTags!.length} cuisine genres (any)` : Array.isArray(v) ? v.join(",") : String(v);
  }

  // 1. Candidates.
  const runWithType = async (params: QlooParams, purpose: string) => {
    try {
      return await qloo.insights(params, purpose);
    } catch (error) {
      if (def.altFilterType && error instanceof QlooError && (error.status === 403 || error.status === 400)) {
        return qloo.insights({ ...params, "filter.type": def.altFilterType }, `${purpose} (fallback type)`);
      }
      throw error;
    }
  };
  const accept = def.accept ?? (() => true);
  const POOL_MAX = def.accept ? POOL_MAX_PLACES : POOL_MAX_MEDIA;
  const groupTake = def.accept ? 50 : 24;
  const personalTake = def.accept ? 15 : 6;
  const fetchCandidates = (params: QlooParams) =>
    Promise.all([
      runWithType(
        { ...params, "signal.interests.entities": allLikes.slice(0, 40), "feature.explainability": true, take: groupTake },
        `${def.label} candidates · whole group`,
      ),
      ...people.map((p) =>
        runWithType({ ...params, "signal.interests.entities": p.likes.map((l) => l.id), take: personalTake }, `${def.label} candidates · ${p.name}`).catch(
          () => ({ entities: [], tags: [], raw: null }),
        ),
      ),
    ]);
  // Places: stay inside the named area first (Qloo pads a locality's edge by
  // default, which pulls Lower Manhattan into "Brooklyn"), widen only if sparse.
  const strict = def.needsLocation ? { ...base, "filter.location.radius": 0 } : base;
  let [groupRes, ...personalRes] = await fetchCandidates(strict);
  if (def.needsLocation && groupRes.entities.filter(accept).length < 10) {
    [groupRes, ...personalRes] = await fetchCandidates(base);
    notes.push(`Few matches inside ${filtersShown.location} itself, so the search includes places just outside it.`);
  }

  const cards = new Map<string, EntityCard>();
  const explainById = new Map<string, Map<string, number>>();
  for (const e of groupRes.entities) {
    if (cards.size >= POOL_MAX) break;
    const { explain, affinity: _a, ...card } = e;
    if (!accept(card)) continue;
    cards.set(e.id, card);
    explainById.set(e.id, explain);
  }
  // Interleave each person's own picks so everyone is represented.
  for (let i = 0; i < personalTake && cards.size < POOL_MAX; i++) {
    for (const r of personalRes) {
      const e = r.entities[i];
      if (e && !cards.has(e.id) && cards.size < POOL_MAX) {
        const { explain: _x, affinity: _a, ...card } = e;
        if (accept(card)) cards.set(e.id, card);
      }
    }
  }
  const poolIds = [...cards.keys()];
  if (!poolIds.length) {
    return {
      ...empty(
        def.needsLocation
          ? `Qloo returned no ${def.label.toLowerCase()} options for "${filtersShown.location}" with these filters.`
          : `Qloo returned no ${def.label.toLowerCase()} options with these filters.`,
      ),
      filters: filtersShown,
    };
  }

  // 2. Each person scored on the same shortlist.
  const scoreMaps = await Promise.all(
    people.map((p) =>
      runWithType(
        { "filter.type": def.filterType, "signal.interests.entities": p.likes.map((l) => l.id), "filter.results.entities": poolIds, take: poolIds.length },
        `Score shortlist for ${p.name}`,
      )
        .then((r) => new Map(r.entities.map((e) => [e.id, e.affinity ?? null])))
        .catch(() => new Map<string, number | null>()),
    ),
  );
  const rankings = people.map((p, i) => rankWithinPool(poolIds, scoreMaps[i]));
  rankings.forEach((r, i) => {
    if (r.missing.length === poolIds.length) notes.push(`Qloo couldn't score the shortlist for ${people[i].name}.`);
    else if (r.missing.length > poolIds.length / 3) notes.push(`Qloo scored only part of the shortlist for ${people[i].name}.`);
  });

  // 3. Fair ranking.
  const sharedTagIds = new Map((input.sharedTags ?? []).map((t) => [t.id, t]));
  const sharedTagNames = new Map((input.sharedTags ?? []).map((t) => [t.name.toLowerCase(), t]));
  const rows = poolIds.map((id) => {
    const card = cards.get(id)!;
    const percentiles = Object.fromEntries(people.map((p, i) => [p.id, rankings[i].percentile.get(id) ?? 0]));
    const ranks = Object.fromEntries(people.map((p, i) => [p.id, rankings[i].rank.get(id) ?? poolIds.length]));
    return { id, card, percentiles, ranks, popularity: card.popularity };
  });
  const { ranked, floor } = rankForGroup(rows, personIds, weights);

  const toCandidate = (r: (typeof ranked)[number], index: number): ScoredCandidate => {
    const explain = explainById.get(r.item.id) ?? new Map<string, number>();
    let attribution = attribute(explain, owners, personIds);
    if (!Object.keys(attribution).length) {
      const total = personIds.reduce((s, id) => s + (r.item.percentiles[id] ?? 0), 0) || 1;
      attribution = Object.fromEntries(personIds.map((id) => [id, Math.round(((r.item.percentiles[id] ?? 0) / total) * 100) / 100]));
    }
    // Strongest contributing favourite per person first, so the credit isn't one person's list.
    const ranked = [...explain.entries()]
      .filter(([eid]) => owners.has(eid))
      .sort((a, b) => b[1] - a[1])
      .flatMap(([eid, w]) => owners.get(eid)!.map((pid) => ({ personId: pid, entityId: eid, entityName: likeNames.get(eid) ?? eid, weight: w })));
    const firstEach = personIds.map((pid) => ranked.find((d) => d.personId === pid)).filter((d): d is (typeof ranked)[number] => Boolean(d));
    const drivers = [...firstEach.sort((a, b) => b.weight - a.weight), ...ranked.filter((d) => !firstEach.includes(d))].slice(0, 4);
    const matchedTags = (r.item.card.tags ?? [])
      .map((t) => sharedTagIds.get(t.id) ?? sharedTagNames.get(t.name.toLowerCase()))
      .filter((t): t is TasteTag => Boolean(t))
      .map((t) => ({ id: t.id, name: t.name, personIds: personIds.filter((pid) => (t.byPerson[pid] ?? 0) >= 0.45) }));
    return {
      ref: `${input.slot}-${index + 1}`,
      entity: r.item.card,
      percentiles: r.item.percentiles,
      ranks: r.item.ranks,
      groupScore: r.groupScore,
      minPercentile: r.minPercentile,
      fair: r.fair,
      attribution,
      drivers,
      matchedTags,
    };
  };

  const keep = input.keep ?? 6;
  const candidates = ranked.slice(0, keep).map(toCandidate);
  const popularIndex = ranked.reduce(
    (best, r, i) => ((r.item.popularity ?? 0) > (ranked[best].item.popularity ?? 0) ? i : best),
    0,
  );
  const popularBaseline = toCandidate(ranked[popularIndex], popularIndex);
  popularBaseline.ref = `${input.slot}-popular`;
  const personalTop = Object.fromEntries(
    people.map((p, i) => {
      const best = poolIds.reduce((a, b) => ((rankings[i].percentile.get(b) ?? 0) > (rankings[i].percentile.get(a) ?? 0) ? b : a));
      return [p.id, { entityId: best, name: cards.get(best)!.name }];
    }),
  );
  if (floor < 0.3) notes.push("Tastes are far apart here, so even the best option sits low on someone's list.");

  return {
    slot: input.slot,
    location: def.needsLocation ? String(filtersShown.location) : undefined,
    poolSize: poolIds.length,
    floor,
    candidates,
    popularBaseline,
    personalTop,
    weights,
    notes,
    filters: filtersShown,
  };
}
