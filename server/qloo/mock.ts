// An offline stand-in for the Qloo API that answers the same GET requests
// (/search, /v2/insights, /v2/tags, /v2/analysis/compare, /entities) with the
// same response shapes, computed from the synthetic catalogue in mockData.ts.
// Affinity is cosine similarity over shared "vibe" weights, which is a crude
// imitation of what Qloo learns from real audiences. It exists so the app can
// be built and tested without a key; it is never presented as real Qloo data.

import type { QlooTransport, TransportResponse } from "./client.js";
import { MOCK_ENTITIES, MOCK_TAGS, VIBES, type MockEntity, type Vibe, type VibeVector } from "./mockData.js";

const byId = new Map(MOCK_ENTITIES.map((e) => [e.id, e]));
const tagById = new Map(MOCK_TAGS.map((t) => [t.id, t]));
const VIBE_KEYS = Object.keys(VIBES) as Vibe[];

const BROOKLYN = ["williamsburg", "greenpoint", "bushwick", "park slope", "carroll gardens", "red hook", "fort greene", "gowanus", "cobble hill"];
const QUEENS = ["astoria"];
const NYC_ALIASES = ["new york", "new york city", "nyc", "the big apple", "manhattan", "brooklyn", "queens"];

function list(value: string | null): string[] {
  return value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

function norm(v: VibeVector): number {
  return Math.sqrt(VIBE_KEYS.reduce((s, k) => s + (v[k] ?? 0) ** 2, 0)) || 1;
}

function cosine(a: VibeVector, b: VibeVector): number {
  const dot = VIBE_KEYS.reduce((s, k) => s + (a[k] ?? 0) * (b[k] ?? 0), 0);
  return dot / (norm(a) * norm(b));
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  const inter = b.filter((x) => sa.has(x)).length;
  return inter / (sa.size + b.length - inter);
}

export function similarity(s: MockEntity, c: MockEntity): number {
  return 0.8 * cosine(s.vibes, c.vibes) + 0.2 * jaccard(s.tags, c.tags);
}

function vibeTagId(v: Vibe) {
  return `urn:tag:style:qloo:${v}`;
}

function entityTagIds(e: MockEntity): string[] {
  const vibeTags = VIBE_KEYS.filter((k) => (e.vibes[k] ?? 0) >= 2).map(vibeTagId);
  return [...e.tags, ...vibeTags];
}

function stableNoise(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  return (h % 1000) / 1000;
}

function entityJson(e: MockEntity, query?: Record<string, unknown>) {
  const props: Record<string, unknown> = {};
  if (e.year) props.release_year = e.year;
  if (e.place) {
    props.address = e.place.address;
    props.price_level = e.place.price;
    props.business_rating = Math.round((3.8 + stableNoise(e.id) * 1.0) * 10) / 10;
    props.geocode = { neighborhood: e.place.neighborhood, city: "New York", country_code: "US" };
    const cuisine = e.tags.find((t) => t.startsWith("urn:tag:genre:place:restaurant:"))?.split(":").pop();
    const kind =
      e.place.category === "bar"
        ? e.tags.includes("urn:tag:category:place:wine_bar")
          ? "wine_bar"
          : e.tags.includes("urn:tag:category:place:cocktail_bar")
            ? "cocktail_bar"
            : "bar"
        : e.place.category === "cafe"
          ? "cafe"
          : (cuisine ?? "");
    props.primary_genre = {
      id: `urn:tag:genre:place:restaurant${kind ? `:${kind}` : ""}`,
      name: kind ? `${kind.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}${e.place.category === "restaurant" ? " restaurant" : ""}` : "Restaurant",
    };
  }
  if (e.country) props.geocode = { country: e.country };
  return {
    name: e.name,
    entity_id: e.id,
    type: "urn:entity",
    subtype: e.urn,
    types: [e.urn],
    popularity: e.popularity,
    disambiguation: e.disambiguation,
    properties: props,
    tags: entityTagIds(e).map((id) => {
      const t = tagById.get(id);
      return { id, name: t?.name ?? id, type: t?.type ?? "urn:tag" };
    }),
    ...(query ? { query } : {}),
  };
}

function ok(body: unknown): TransportResponse {
  return { status: 200, body };
}

function bad(status: number, message: string): TransportResponse {
  return { status, body: { code: status, reason: status === 400 ? "Bad Request" : "Error", message } };
}

function placeMatchesLocation(e: MockEntity, location: string): boolean {
  if (!e.place) return false;
  const q = location.toLowerCase().trim();
  const hood = e.place.neighborhood.toLowerCase();
  if (q === "brooklyn") return BROOKLYN.includes(hood);
  if (q === "queens") return QUEENS.includes(hood);
  if (q === "manhattan") return !BROOKLYN.includes(hood) && !QUEENS.includes(hood);
  if (NYC_ALIASES.some((a) => q === a || q.startsWith(`${a},`) || q.endsWith(` ${a}`))) return true;
  return hood === q || q.includes(hood);
}

function knownLocation(location: string): boolean {
  const q = location.toLowerCase().trim();
  return NYC_ALIASES.some((a) => q.includes(a)) || MOCK_ENTITIES.some((e) => e.place && q.includes(e.place.neighborhood.toLowerCase()));
}

/** Weighted tag profile of a set of signal entities, scaled so the top tag is 1. */
function tagProfile(signals: MockEntity[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const s of signals) {
    const max = Math.max(...VIBE_KEYS.map((k) => s.vibes[k] ?? 0), 1);
    for (const k of VIBE_KEYS) {
      const w = (s.vibes[k] ?? 0) / max;
      if (w > 0) scores.set(vibeTagId(k), (scores.get(vibeTagId(k)) ?? 0) + w);
    }
    for (const t of s.tags) scores.set(t, (scores.get(t) ?? 0) + 0.55);
  }
  const top = Math.max(...scores.values(), 1e-9);
  for (const [k, v] of scores) scores.set(k, Math.round((v / top) * 1000) / 1000);
  return scores;
}

function paginate<T>(items: T[], q: URLSearchParams, fallbackTake = 20): T[] {
  const take = Math.min(Math.max(Number(q.get("take") ?? fallbackTake) || fallbackTake, 1), 50);
  const offset = q.get("offset") ? Number(q.get("offset")) : (Math.max(Number(q.get("page") ?? 1), 1) - 1) * take;
  return items.slice(offset, offset + take);
}

function signalEntities(q: URLSearchParams, prefix = ""): MockEntity[] {
  return list(q.get(`${prefix}signal.interests.entities`))
    .map((id) => byId.get(id))
    .filter((e): e is MockEntity => Boolean(e));
}

function insights(q: URLSearchParams): TransportResponse {
  const type = q.get("filter.type");
  if (!type) return bad(400, "filter.type is required");
  const signals = signalEntities(q);
  const signalTags = list(q.get("signal.interests.tags"));

  if (type === "urn:tag") {
    if (!signals.length && !signalTags.length) return bad(400, "at least one valid signal or filter is required");
    const profile = tagProfile(signals);
    let tags = [...profile.entries()];
    const only = list(q.get("filter.results.tags"));
    if (only.length) tags = only.map((id) => [id, profile.get(id) ?? 0] as [string, number]);
    const tagTypes = list(q.get("filter.tag.types"));
    if (tagTypes.length) tags = tags.filter(([id]) => tagTypes.some((p) => id.startsWith(p)));
    tags.sort((a, b) => b[1] - a[1]);
    return ok({
      success: true,
      results: {
        tags: paginate(tags, q).map(([id, affinity]) => {
          const t = tagById.get(id);
          return { tag_id: id, name: t?.name ?? id, types: t?.parents ?? [], subtype: t?.type ?? "urn:tag", query: { affinity } };
        }),
      },
      duration: 9,
    });
  }

  const urn = type === "urn:entity:locality" ? "urn:entity:destination" : type;
  // Same list the hackathon guide documents; anything else is a 403 there too.
  const supported = ["artist", "book", "brand", "destination", "movie", "person", "place", "podcast", "tv_show", "videogame", "video_game"].map((t) => `urn:entity:${t}`);
  if (!supported.includes(urn)) return bad(403, `You do not have permission to access ${type}`);
  let pool = MOCK_ENTITIES.filter((e) => e.urn === urn);

  const filterTags = list(q.get("filter.tags"));
  if (filterTags.length) {
    const all = q.get("operator.filter.tags") === "intersection";
    pool = pool.filter((e) => {
      const ids = new Set(entityTagIds(e));
      return all ? filterTags.every((t) => ids.has(t)) : filterTags.some((t) => ids.has(t));
    });
  }
  const excludeTags = list(q.get("filter.exclude.tags"));
  if (excludeTags.length) pool = pool.filter((e) => !entityTagIds(e).some((t) => excludeTags.includes(t)));
  const excludeIds = new Set(list(q.get("filter.exclude.entities")));
  if (excludeIds.size) pool = pool.filter((e) => !excludeIds.has(e.id));
  const onlyIds = list(q.get("filter.results.entities"));
  if (onlyIds.length) {
    const set = new Set(onlyIds);
    pool = pool.filter((e) => set.has(e.id));
  }
  const location = q.get("filter.location.query");
  if (location && urn === "urn:entity:place") {
    if (!knownLocation(location)) return ok({ success: true, results: { entities: [] }, duration: 4 });
    pool = pool.filter((e) => placeMatchesLocation(e, location));
  }
  const priceMin = Number(q.get("filter.price_level.min") ?? 0);
  const priceMax = Number(q.get("filter.price_level.max") ?? 9);
  if (urn === "urn:entity:place") pool = pool.filter((e) => (e.place?.price ?? 2) >= priceMin && (e.place?.price ?? 2) <= priceMax);
  const yearMin = Number(q.get("filter.release_year.min") ?? 0);
  const yearMax = Number(q.get("filter.release_year.max") ?? 9999);
  pool = pool.filter((e) => !e.year || (e.year >= yearMin && e.year <= yearMax));
  const popMin = Number(q.get("filter.popularity.min") ?? 0);
  pool = pool.filter((e) => e.popularity >= popMin);

  const explain = q.get("feature.explainability") === "true";
  const scored = pool.map((c) => {
    if (!signals.length && !signalTags.length) return { c, affinity: null as number | null, contributions: [] as Array<[string, number]> };
    const sims = signals.map((s) => [s.id, similarity(s, c)] as [string, number]);
    const tagHits = signalTags.filter((t) => entityTagIds(c).includes(t)).length;
    const base = sims.length ? sims.reduce((a, [, v]) => a + v, 0) / sims.length : 0;
    const affinity = Math.min(0.999, 0.82 * base + 0.12 * c.popularity + (signalTags.length ? 0.15 * (tagHits / signalTags.length) : 0));
    const top = Math.max(...sims.map(([, v]) => v), 1e-9);
    const contributions = sims
      .map(([id, v]) => [id, Math.round((v / top) * 1000) / 1000] as [string, number])
      .filter(([, v]) => v >= 0.1)
      .sort((a, b) => b[1] - a[1]);
    return { c, affinity: Math.round(affinity * 10000) / 10000, contributions };
  });
  scored.sort((a, b) => (b.affinity ?? b.c.popularity) - (a.affinity ?? a.c.popularity) || b.c.popularity - a.c.popularity);

  return ok({
    success: true,
    results: {
      entities: paginate(scored, q).map(({ c, affinity, contributions }) =>
        entityJson(c, {
          affinity,
          ...(explain && contributions.length
            ? { explainability: { "signal.interests.entities": contributions.map(([entity_id, score]) => ({ entity_id, score })) } }
            : {}),
        }),
      ),
    },
    duration: 12,
  });
}

function tagSearch(q: URLSearchParams): TransportResponse {
  const query = (q.get("filter.query") ?? "").toLowerCase().trim();
  if (!query) return bad(400, "filter.query is required");
  const parent = q.get("filter.parents.types");
  const scored = MOCK_TAGS.map((t) => {
    const name = t.name.toLowerCase();
    let score = 0;
    if (name === query) score = 1;
    else if (name.startsWith(query) || query.startsWith(name)) score = 0.8;
    else if (name.includes(query) || query.includes(name)) score = 0.6;
    for (const syn of t.synonyms ?? []) {
      if (syn === query) score = Math.max(score, 0.9);
      else if (query.includes(syn) || syn.includes(query)) score = Math.max(score, 0.65);
    }
    return { t, score };
  })
    .filter(({ t, score }) => score > 0 && (!parent || t.parents.includes(parent)))
    .sort((a, b) => b.score - a.score);
  return ok({
    success: true,
    results: {
      tags: paginate(scored, q, 8).map(({ t }) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        parents: t.parents.map((type) => ({ type })),
        popularity: 0.5,
      })),
    },
  });
}

function compare(q: URLSearchParams): TransportResponse {
  const a = signalEntities(q, "a.");
  const b = signalEntities(q, "b.");
  if (!a.length || !b.length) return bad(400, "both a. and b. signals are required");
  const pa = tagProfile(a);
  const pb = tagProfile(b);
  const shared = [...pa.keys()]
    .filter((k) => pb.has(k))
    .map((k) => [k, Math.sqrt(pa.get(k)! * pb.get(k)!)] as [string, number])
    .sort((x, y) => y[1] - x[1]);
  return ok({
    duration: 0.02,
    results: {
      tags: paginate(shared, q, 10).map(([id, score]) => {
        const t = tagById.get(id);
        return { tag_id: id, name: t?.name ?? id, type: "urn:tag", subtype: t?.type, popularity: 0.5, query: { score: Math.round(score * 1000) / 1000 } };
      }),
    },
  });
}

function search(q: URLSearchParams): TransportResponse {
  const query = (q.get("query") ?? "").toLowerCase().trim();
  if (!query) return bad(400, "query is required");
  const types = list(q.get("types")).map((t) => (t === "urn:entity:locality" ? "urn:entity:destination" : t));
  const tokens = query.split(/\s+/);
  const scored = MOCK_ENTITIES.filter((e) => !types.length || types.includes(e.urn))
    .map((e) => {
      const name = e.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      const qn = query.normalize("NFD").replace(/[̀-ͯ]/g, "");
      let score = 0;
      if (name === qn) score = 1;
      else if (name.startsWith(qn)) score = 0.9;
      else if (name.includes(qn)) score = 0.75;
      else score = (tokens.filter((t) => name.includes(t)).length / tokens.length) * 0.6;
      return { e, score: score + e.popularity * 0.05 };
    })
    .filter(({ score }) => score >= 0.33)
    .sort((a, b) => b.score - a.score);
  return ok({ success: true, duration: 0.01, results: paginate(scored, q, 8).map(({ e }) => entityJson(e)) });
}

function entities(q: URLSearchParams): TransportResponse {
  const ids = list(q.get("entity_ids"));
  if (!ids.length) return bad(400, "entity_ids must be specified.");
  return ok({ success: true, results: ids.map((id) => byId.get(id)).filter(Boolean).map((e) => entityJson(e!)) });
}

export function mockTransport(opts: { latencyMs?: number } = {}): QlooTransport {
  const latency = opts.latencyMs ?? 0;
  return {
    mode: "mock",
    async get(path, query) {
      if (latency) await new Promise((r) => setTimeout(r, latency));
      switch (path) {
        case "/search":
          return search(query);
        case "/v2/insights":
          return insights(query);
        case "/v2/tags":
          return tagSearch(query);
        case "/v2/analysis/compare":
          return compare(query);
        case "/entities":
          return entities(query);
        default:
          return bad(404, `No path matching ${path}`);
      }
    },
  };
}
