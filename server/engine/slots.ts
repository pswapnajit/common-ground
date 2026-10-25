// What each plan item means in Qloo terms.

import type { EntityCard, SlotKind } from "../../shared/types.js";
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
  /** Keeps only results that really are this kind of thing (Qloo's place tags are broad). */
  accept?: (e: EntityCard) => boolean;
  /** Specific genre tags to OR together when there are no other tag filters. */
  unionTags?: string[];
}

const GENRE = "urn:tag:genre:place:";
// Places tagged "restaurant" include cafes, bakeries, malls and markets; dinner wants a sit-down meal.
const NOT_DINNER = /:(cafe|coffee_shop|espresso_bar|tea_house|tea_room|bakery|patisserie|dessert_shop|ice_cream_shop|donut_shop|cupcake_shop|cookie_shop|juice_shop|juice_bar|smoothie_shop|bubble_tea_shop|bagel_shop|sandwich_shop|fast_food|food_court|food_truck|deli|bar|cocktail_bar|wine_bar|beer_garden|brewery|distillery|pub|irish_pub|lounge|sports_bar|hookah_bar|night_club|candy_store|chocolate_shop)$/;
const DRINKS = /:(bar|cocktail_bar|wine_bar|beer_garden|beer_hall|brewery|brewpub|distillery|winery|pub|irish_pub|gastropub|lounge|speakeasy|tiki_bar|sake_bar|sports_bar|piano_bar|karaoke_bar|rooftop_bar|hotel_bar|tavern|taproom|jazz_club|oyster_bar|izakaya)$/;

export function isDinner(e: EntityCard): boolean {
  if (e.closed) return false;
  if (!e.genreId) return true; // no genre data: let it through rather than drop everything
  if (e.genreId === `${GENRE}bar_&_grill`) return true;
  return e.genreId.startsWith(`${GENRE}restaurant`) && !NOT_DINNER.test(e.genreId);
}

// The broad "restaurant" tag is mostly cafes and bars in some areas; OR-ing
// cuisine genres keeps the shortlist to places people go for dinner.
const CUISINES = [
  "italian", "japanese", "american", "new_american", "mexican", "chinese", "french", "thai", "indian", "korean",
  "mediterranean", "pizza", "seafood", "spanish", "vietnamese", "middle_eastern", "steak_house", "greek",
  "latin_american", "caribbean", "ethiopian", "turkish", "peruvian", "sushi", "ramen", "barbecue", "southern",
  "vegetarian", "vegan", "modern_european", "israeli", "lebanese", "brazilian", "filipino", "taiwanese", "fine_dining",
].map((c) => `${GENRE}restaurant:${c}`);

export function isDrinks(e: EntityCard): boolean {
  if (e.closed) return false;
  if (!e.genreId) return true;
  return DRINKS.test(e.genreId);
}

export const SLOTS: Record<SlotKind, SlotDef> = {
  dinner: {
    slot: "dinner",
    filterType: "urn:entity:place",
    category: { query: "restaurant", prefixes: ["urn:tag:category:place", "urn:tag:genre:place"], names: ["restaurant", "restaurants"] },
    needsLocation: true,
    label: "Dinner",
    accept: isDinner,
    unionTags: CUISINES,
  },
  drinks: {
    slot: "drinks",
    filterType: "urn:entity:place",
    category: { query: "bar", prefixes: ["urn:tag:category:place", "urn:tag:genre:place"], names: ["bar", "bars", "cocktail bar"] },
    needsLocation: true,
    label: "Drinks",
    accept: isDrinks,
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
