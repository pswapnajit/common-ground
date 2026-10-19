// What each plan item means in Qloo terms.

import type { SlotKind } from "../../shared/types.js";
import type { Qloo } from "../qloo/client.js";

export interface SlotDef {
  slot: SlotKind;
  filterType: string;
  /** Fallback entity type if the first one is refused (hackathon docs disagree on destinations). */
  altFilterType?: string;
  /** Concept to resolve to a Qloo category tag, e.g. "restaurant". */
  category?: { query: string; prefixes: string[]; names: string[] };
  needsLocation: boolean;
  label: string;
}

export const SLOTS: Record<SlotKind, SlotDef> = {
  dinner: {
    slot: "dinner",
    filterType: "urn:entity:place",
    category: { query: "restaurant", prefixes: ["urn:tag:category:place", "urn:tag:genre:place"], names: ["restaurant", "restaurants"] },
    needsLocation: true,
    label: "Dinner",
  },
  drinks: {
    slot: "drinks",
    filterType: "urn:entity:place",
    category: { query: "bar", prefixes: ["urn:tag:category:place", "urn:tag:genre:place"], names: ["bar", "bars", "cocktail bar"] },
    needsLocation: true,
    label: "Drinks",
  },
  movie: { slot: "movie", filterType: "urn:entity:movie", needsLocation: false, label: "Movie" },
  series: { slot: "series", filterType: "urn:entity:tv_show", needsLocation: false, label: "Series" },
  music: { slot: "music", filterType: "urn:entity:artist", needsLocation: false, label: "Music" },
  book: { slot: "book", filterType: "urn:entity:book", needsLocation: false, label: "Book" },
  trip: {
    slot: "trip",
    filterType: "urn:entity:destination",
    altFilterType: "urn:entity:locality",
    needsLocation: false,
    label: "Weekend trip",
  },
};

const categoryCache = new Map<string, string | null>();

/** Finds the Qloo tag id for a slot's category (e.g. restaurants), once per process. */
export async function resolveCategoryTag(qloo: Qloo, def: SlotDef): Promise<string | undefined> {
  if (!def.category) return undefined;
  const key = `${qloo.mode}:${def.slot}`;
  if (categoryCache.has(key)) return categoryCache.get(key) ?? undefined;
  try {
    const tags = await qloo.findTags(def.category.query, { take: 12, parentType: def.filterType }, `Find the "${def.category.query}" category tag`);
    const inScope = tags.filter(
      (t) =>
        def.category!.prefixes.some((p) => t.id.startsWith(p) || t.type?.startsWith(p)) &&
        (!t.parents.length || t.parents.includes(def.filterType)),
    );
    const exact = inScope.find((t) => def.category!.names.includes(t.name.toLowerCase()) || def.category!.names.some((n) => t.id.endsWith(`:${n.replace(/ /g, "_")}`)));
    const chosen = exact ?? inScope[0];
    categoryCache.set(key, chosen?.id ?? null);
    return chosen?.id;
  } catch {
    categoryCache.set(key, null);
    return undefined;
  }
}

export function clearSlotCache() {
  categoryCache.clear();
}
