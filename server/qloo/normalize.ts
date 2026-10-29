// Turns raw Qloo API JSON into the small shapes the engine and UI use.
// The API is inconsistent across endpoints (entity_id vs id, tag_id vs id,
// results[] vs results.entities[]), so every reader here is defensive.

import type { EntityCard, EntityKind, TagRef } from "../../shared/types.js";

type Json = Record<string, any>;

const KIND_BY_URN: Record<string, EntityKind> = {
  "urn:entity:movie": "movie",
  "urn:entity:tv_show": "tv_show",
  "urn:entity:artist": "artist",
  "urn:entity:book": "book",
  "urn:entity:place": "place",
  "urn:entity:destination": "destination",
  "urn:entity:locality": "destination",
  "urn:entity:podcast": "podcast",
  "urn:entity:brand": "brand",
  "urn:entity:videogame": "video_game",
  "urn:entity:video_game": "video_game",
  "urn:entity:person": "person",
  "urn:entity:actor": "person",
  "urn:entity:director": "person",
  "urn:entity:author": "person",
};

export const URN_BY_KIND: Record<EntityKind, string> = {
  movie: "urn:entity:movie",
  tv_show: "urn:entity:tv_show",
  artist: "urn:entity:artist",
  book: "urn:entity:book",
  place: "urn:entity:place",
  destination: "urn:entity:destination",
  podcast: "urn:entity:podcast",
  brand: "urn:entity:brand",
  video_game: "urn:entity:videogame",
  person: "urn:entity:person",
};

export function kindFromUrn(urn: unknown): EntityKind | undefined {
  return typeof urn === "string" ? KIND_BY_URN[urn] : undefined;
}

function asRecord(value: unknown): Json | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

/** results can be an array, or an object holding the array under `key`. */
export function resultArray(body: unknown, key: "entities" | "tags"): Json[] {
  const results = asRecord(body)?.results;
  if (Array.isArray(results)) return results.filter((r) => asRecord(r)) as Json[];
  const inner = asRecord(results)?.[key];
  return Array.isArray(inner) ? (inner.filter((r) => asRecord(r)) as Json[]) : [];
}

export function entityKind(raw: Json): EntityKind | undefined {
  const direct = kindFromUrn(raw.subtype) ?? kindFromUrn(raw.type);
  if (direct) return direct;
  if (Array.isArray(raw.types)) {
    for (const t of raw.types) {
      const k = kindFromUrn(t);
      if (k) return k;
    }
  }
  return undefined;
}

// Tag families that read well to a person. Streaming-service and very long
// keyword tags are noise in a taste summary.
const NOISY_TAG_TYPES = ["urn:tag:streaming_service", "urn:tag:platform", "urn:tag:offering", "urn:tag:wikidata"];

export function isReadableTag(tag: TagRef): boolean {
  if (!tag.name || tag.name.length > 32) return false;
  if (tag.type && NOISY_TAG_TYPES.some((p) => tag.type!.startsWith(p))) return false;
  return true;
}

export function toTag(raw: Json): TagRef & { affinity?: number; popularity?: number } {
  const query = asRecord(raw.query);
  return {
    id: str(raw.tag_id) ?? str(raw.id) ?? str(raw.tag_value) ?? "",
    name: str(raw.name) ?? "",
    type: str(raw.subtype) ?? str(raw.type),
    affinity: num(query?.affinity) ?? num(query?.score) ?? num(raw.affinity) ?? num(raw.score),
    popularity: num(raw.popularity),
  };
}

function priceLevel(props: Json): number | undefined {
  const p = num(props.price_level);
  return p && p >= 1 && p <= 4 ? Math.round(p) : undefined;
}

function subtitleFor(kind: EntityKind | undefined, raw: Json, props: Json, geocode: Json | undefined, genre: string | undefined, tags: TagRef[]): string | undefined {
  const year = num(props.release_year) ?? num(str(props.release_date)?.slice(0, 4)) ?? num(props.publication_year);
  const disambiguation = str(raw.disambiguation) && str(raw.disambiguation) !== str(raw.name) ? str(raw.disambiguation) : undefined;
  switch (kind) {
    case "movie":
      return year ? String(year) : disambiguation;
    case "tv_show":
      return year ? `TV · ${year}` : "TV";
    case "book":
      return disambiguation ?? (year ? String(year) : undefined);
    case "artist":
      return tags.find((t) => t.type?.startsWith("urn:tag:genre:music"))?.name ?? disambiguation;
    case "place": {
      const where = str(props.neighborhood) ?? str(geocode?.neighborhood) ?? str(geocode?.name) ?? str(geocode?.city);
      const price = priceLevel(props);
      const what = genre && !/^(restaurant|place)$/i.test(genre) ? genre : undefined;
      return [what, where, price ? "$".repeat(price) : undefined].filter(Boolean).join(" · ") || str(props.address);
    }
    case "destination":
      return str(geocode?.admin1_region) ?? str(geocode?.country) ?? disambiguation;
    default:
      return disambiguation ?? (year ? String(year) : undefined);
  }
}

export function toEntityCard(raw: Json): EntityCard & { affinity?: number } {
  const props = asRecord(raw.properties) ?? {};
  const geocode = asRecord(props.geocode) ?? asRecord(raw.geocode);
  const kind = entityKind(raw) ?? "brand";
  const tags: TagRef[] = Array.isArray(raw.tags)
    ? raw.tags
        .map((t: unknown) => asRecord(t))
        .filter((t: Json | undefined): t is Json => Boolean(t))
        .map((t: Json) => ({ id: str(t.id) ?? str(t.tag_id) ?? "", name: str(t.name) ?? "", type: str(t.type) ?? str(t.subtype) }))
        .filter((t: TagRef) => t.id && isReadableTag(t))
        .filter((t: TagRef, i: number, all: TagRef[]) => all.findIndex((x) => x.name.toLowerCase() === t.name.toLowerCase()) === i)
        .slice(0, 8)
    : [];
  const primary = asRecord(props.primary_genre);
  const genre = str(primary?.name);
  const image = str(asRecord(props.image)?.url) ?? str(asRecord(raw.image)?.url);
  const query = asRecord(raw.query);
  return {
    id: str(raw.entity_id) ?? str(raw.id) ?? "",
    name: str(raw.name) ?? "Untitled",
    kind,
    subtitle: subtitleFor(kind, raw, props, geocode, genre, tags),
    image,
    popularity: num(raw.popularity),
    priceLevel: priceLevel(props),
    address: str(props.address),
    neighborhood: str(props.neighborhood) ?? str(geocode?.neighborhood),
    city: str(geocode?.city),
    rating: num(props.business_rating),
    genre,
    genreId: str(primary?.id),
    closed: props.is_closed === true ? true : undefined,
    tags,
    description: str(props.short_description) ?? str(props.description)?.slice(0, 280),
    affinity: num(query?.affinity),
  };
}

/**
 * Reads `query.explainability` from one result. The documented contract is
 * "which input entities contributed, with normalised scores between 0 and 1";
 * the exact nesting isn't documented, so collect every {id, score} pair found.
 */
export function parseExplainability(raw: Json): Map<string, number> {
  const out = new Map<string, number>();
  const root = asRecord(raw.query)?.explainability ?? raw.explainability;
  const visit = (node: unknown, depth: number) => {
    if (depth > 5 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const rec = asRecord(node);
    if (!rec) return;
    const id = str(rec.entity_id) ?? str(rec.id) ?? str(rec.entity);
    const score = num(rec.score) ?? num(rec.weight) ?? num(rec.value) ?? num(rec.contribution) ?? num(rec.impact);
    if (id && score !== undefined) {
      out.set(id, Math.max(out.get(id) ?? 0, score));
      return;
    }
    for (const [key, value] of Object.entries(rec)) {
      // Some shapes key the scores by entity id directly.
      if (/^[0-9A-F]{8}-[0-9A-F]{4}-/i.test(key) && num(value) !== undefined) {
        out.set(key, Math.max(out.get(key) ?? 0, num(value)!));
      } else {
        visit(value, depth + 1);
      }
    }
  };
  visit(root, 0);
  return out;
}

// Fields the app reads from an entity. Live responses also carry dozens of
// localised titles, menus, opening hours and long descriptions; dropping them
// keeps the private cache and each request's memory small.
const KEEP_PROPS = [
  "release_year",
  "release_date",
  "publication_year",
  "image",
  "geocode",
  "address",
  "price_level",
  "business_rating",
  "neighborhood",
  "is_closed",
  "short_description",
  "description",
];

export function slimEntity(raw: Json): Json {
  const props = asRecord(raw.properties);
  const slimProps: Json = {};
  if (props) {
    for (const k of KEEP_PROPS) if (props[k] !== undefined) slimProps[k] = props[k];
    if (typeof slimProps.description === "string") slimProps.description = slimProps.description.slice(0, 400);
    if (typeof slimProps.short_description !== "string") delete slimProps.short_description;
    const pg = asRecord(props.primary_genre);
    if (pg) slimProps.primary_genre = { id: pg.id, name: pg.name };
    const img = asRecord(props.image);
    if (img) slimProps.image = { url: img.url };
  }
  return {
    entity_id: raw.entity_id,
    id: raw.id,
    name: raw.name,
    type: raw.type,
    subtype: raw.subtype,
    types: raw.types,
    popularity: raw.popularity,
    disambiguation: raw.disambiguation,
    properties: slimProps,
    tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 30) : undefined,
    query: raw.query,
  };
}

/** Returns the response with every entity slimmed (tags-only responses pass through). */
export function slimBody(body: unknown): unknown {
  const rec = asRecord(body);
  if (!rec) return body;
  const results = rec.results;
  if (Array.isArray(results)) return { ...rec, results: results.map((r) => (asRecord(r) ? slimEntity(r as Json) : r)) };
  const inner = asRecord(results);
  if (inner && Array.isArray(inner.entities)) {
    return { ...rec, results: { ...inner, entities: inner.entities.map((r: unknown) => (asRecord(r) ? slimEntity(r as Json) : r)) } };
  }
  return body;
}
