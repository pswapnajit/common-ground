// SYNTHETIC data for the offline mock of the Qloo API. None of this came from
// Qloo: the "vibe" weights, tags, popularity numbers and ids are invented so
// the app can run and be tested without an API key. Restaurants and bars are
// fictional. Film, TV, music and book titles are public names used as
// realistic inputs; their attributes here are made up.

export const VIBES = {
  dark: "Dark & moody",
  cozy: "Cozy",
  quirky: "Quirky",
  glam: "Glamorous",
  retro: "Nostalgic",
  cerebral: "Cerebral",
  thrill: "High energy",
  romantic: "Romantic",
  comedic: "Funny",
  worldly: "Worldly",
  earthy: "Earthy",
  street: "Street culture",
  geeky: "Geeky",
  luxe: "Luxurious",
} as const;

export type Vibe = keyof typeof VIBES;
export type VibeVector = Partial<Record<Vibe, number>>;

export interface MockEntity {
  id: string;
  name: string;
  urn: string;
  vibes: VibeVector;
  tags: string[]; // domain tag ids
  popularity: number;
  year?: number;
  disambiguation?: string;
  place?: {
    neighborhood: string;
    price: number;
    address: string;
    category: "restaurant" | "bar" | "cafe";
  };
  country?: string;
}

export interface MockTag {
  id: string;
  name: string;
  type: string;
  parents: string[];
  synonyms?: string[];
}

// Deterministic pseudo-UUIDs (FNV-1a) so ids are stable across runs.
function fnv(input: string, seed: number): string {
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).toUpperCase().padStart(8, "0");
}

export function mockId(kind: string, name: string): string {
  const s = `${kind}:${name}`;
  const a = fnv(s, 1), b = fnv(s, 2), c = fnv(s, 3), d = fnv(s, 4);
  return `${a}-${b.slice(0, 4)}-4${b.slice(5, 8)}-A${c.slice(1, 4)}-${c.slice(4)}${d}`;
}

const MEDIA = ["urn:entity:movie", "urn:entity:tv_show"];

const TAGS: MockTag[] = [
  // media genres
  { id: "urn:tag:genre:media:horror", name: "Horror", type: "urn:tag:genre:media", parents: MEDIA, synonyms: ["scary", "spooky", "creepy"] },
  { id: "urn:tag:genre:media:thriller", name: "Thriller", type: "urn:tag:genre:media", parents: MEDIA, synonyms: ["suspense"] },
  { id: "urn:tag:genre:media:comedy", name: "Comedy", type: "urn:tag:genre:media", parents: MEDIA, synonyms: ["funny", "laugh"] },
  { id: "urn:tag:genre:media:romance", name: "Romance", type: "urn:tag:genre:media", parents: MEDIA, synonyms: ["romantic", "love story"] },
  { id: "urn:tag:genre:media:drama", name: "Drama", type: "urn:tag:genre:media", parents: MEDIA },
  { id: "urn:tag:genre:media:science_fiction", name: "Science Fiction", type: "urn:tag:genre:media", parents: MEDIA, synonyms: ["sci-fi", "scifi"] },
  { id: "urn:tag:genre:media:action", name: "Action", type: "urn:tag:genre:media", parents: MEDIA },
  { id: "urn:tag:genre:media:animation", name: "Animation", type: "urn:tag:genre:media", parents: MEDIA, synonyms: ["animated", "cartoon"] },
  { id: "urn:tag:genre:media:musical", name: "Musical", type: "urn:tag:genre:media", parents: MEDIA },
  { id: "urn:tag:genre:media:crime", name: "Crime", type: "urn:tag:genre:media", parents: MEDIA },
  { id: "urn:tag:genre:media:family", name: "Family", type: "urn:tag:genre:media", parents: MEDIA, synonyms: ["kids", "kid-friendly"] },
  { id: "urn:tag:genre:media:reality", name: "Reality", type: "urn:tag:genre:media", parents: ["urn:entity:tv_show"] },
  // music genres
  { id: "urn:tag:genre:music:pop", name: "Pop", type: "urn:tag:genre:music", parents: ["urn:entity:artist"] },
  { id: "urn:tag:genre:music:hip_hop", name: "Hip Hop", type: "urn:tag:genre:music", parents: ["urn:entity:artist"], synonyms: ["rap"] },
  { id: "urn:tag:genre:music:indie", name: "Indie", type: "urn:tag:genre:music", parents: ["urn:entity:artist"] },
  { id: "urn:tag:genre:music:folk", name: "Folk", type: "urn:tag:genre:music", parents: ["urn:entity:artist"] },
  { id: "urn:tag:genre:music:rock", name: "Rock", type: "urn:tag:genre:music", parents: ["urn:entity:artist"] },
  { id: "urn:tag:genre:music:metal", name: "Metal", type: "urn:tag:genre:music", parents: ["urn:entity:artist"] },
  { id: "urn:tag:genre:music:jazz", name: "Jazz", type: "urn:tag:genre:music", parents: ["urn:entity:artist"] },
  { id: "urn:tag:genre:music:electronic", name: "Electronic", type: "urn:tag:genre:music", parents: ["urn:entity:artist"], synonyms: ["edm", "dance"] },
  { id: "urn:tag:genre:music:r_and_b", name: "R&B", type: "urn:tag:genre:music", parents: ["urn:entity:artist"], synonyms: ["rnb", "soul"] },
  { id: "urn:tag:genre:music:latin", name: "Latin", type: "urn:tag:genre:music", parents: ["urn:entity:artist"] },
  { id: "urn:tag:genre:music:k_pop", name: "K-Pop", type: "urn:tag:genre:music", parents: ["urn:entity:artist"] },
  // books
  { id: "urn:tag:genre:book:literary_fiction", name: "Literary Fiction", type: "urn:tag:genre:book", parents: ["urn:entity:book"] },
  { id: "urn:tag:genre:book:mystery", name: "Mystery", type: "urn:tag:genre:book", parents: ["urn:entity:book"] },
  { id: "urn:tag:genre:book:fantasy", name: "Fantasy", type: "urn:tag:genre:book", parents: ["urn:entity:book"] },
  { id: "urn:tag:genre:book:romance", name: "Romance Novels", type: "urn:tag:genre:book", parents: ["urn:entity:book"] },
  { id: "urn:tag:genre:book:science_fiction", name: "Science Fiction Books", type: "urn:tag:genre:book", parents: ["urn:entity:book"] },
  { id: "urn:tag:genre:book:nonfiction", name: "Nonfiction", type: "urn:tag:genre:book", parents: ["urn:entity:book"], synonyms: ["memoir"] },
  // places
  { id: "urn:tag:category:place:restaurant", name: "Restaurant", type: "urn:tag:category:place", parents: ["urn:entity:place"], synonyms: ["dinner", "eat", "food"] },
  { id: "urn:tag:category:place:bar", name: "Bar", type: "urn:tag:category:place", parents: ["urn:entity:place"], synonyms: ["drinks", "pub"] },
  { id: "urn:tag:category:place:cocktail_bar", name: "Cocktail Bar", type: "urn:tag:category:place", parents: ["urn:entity:place"], synonyms: ["cocktails"] },
  { id: "urn:tag:category:place:wine_bar", name: "Wine Bar", type: "urn:tag:category:place", parents: ["urn:entity:place"], synonyms: ["wine", "natural wine"] },
  { id: "urn:tag:category:place:cafe", name: "Cafe", type: "urn:tag:category:place", parents: ["urn:entity:place"], synonyms: ["coffee"] },
  { id: "urn:tag:genre:place:restaurant:italian", name: "Italian", type: "urn:tag:genre:place", parents: ["urn:entity:place"], synonyms: ["pasta", "pizza"] },
  { id: "urn:tag:genre:place:restaurant:japanese", name: "Japanese", type: "urn:tag:genre:place", parents: ["urn:entity:place"], synonyms: ["sushi", "ramen"] },
  { id: "urn:tag:genre:place:restaurant:mexican", name: "Mexican", type: "urn:tag:genre:place", parents: ["urn:entity:place"], synonyms: ["tacos"] },
  { id: "urn:tag:genre:place:restaurant:korean", name: "Korean", type: "urn:tag:genre:place", parents: ["urn:entity:place"], synonyms: ["kbbq"] },
  { id: "urn:tag:genre:place:restaurant:indian", name: "Indian", type: "urn:tag:genre:place", parents: ["urn:entity:place"], synonyms: ["curry"] },
  { id: "urn:tag:genre:place:restaurant:thai", name: "Thai", type: "urn:tag:genre:place", parents: ["urn:entity:place"] },
  { id: "urn:tag:genre:place:restaurant:french", name: "French", type: "urn:tag:genre:place", parents: ["urn:entity:place"], synonyms: ["bistro"] },
  { id: "urn:tag:genre:place:restaurant:american", name: "American", type: "urn:tag:genre:place", parents: ["urn:entity:place"], synonyms: ["burger", "diner"] },
  { id: "urn:tag:genre:place:restaurant:middle_eastern", name: "Middle Eastern", type: "urn:tag:genre:place", parents: ["urn:entity:place"], synonyms: ["falafel", "mezze"] },
  { id: "urn:tag:genre:place:restaurant:chinese", name: "Chinese", type: "urn:tag:genre:place", parents: ["urn:entity:place"], synonyms: ["dumplings", "dim sum"] },
  { id: "urn:tag:genre:place:restaurant:steakhouse", name: "Steakhouse", type: "urn:tag:genre:place", parents: ["urn:entity:place"], synonyms: ["steak"] },
  { id: "urn:tag:genre:place:restaurant:seafood", name: "Seafood", type: "urn:tag:genre:place", parents: ["urn:entity:place"], synonyms: ["fish", "oysters"] },
  { id: "urn:tag:dining_options:place:vegetarian_friendly", name: "Vegetarian Friendly", type: "urn:tag:dining_options:place", parents: ["urn:entity:place"], synonyms: ["vegetarian", "veggie", "vegan", "plant based"] },
  { id: "urn:tag:amenity:place:rooftop", name: "Rooftop", type: "urn:tag:amenity:place", parents: ["urn:entity:place"], synonyms: ["roof", "view"] },
  { id: "urn:tag:amenity:place:live_music", name: "Live Music", type: "urn:tag:amenity:place", parents: ["urn:entity:place"], synonyms: ["band", "jazz club"] },
  { id: "urn:tag:amenity:place:outdoor_seating", name: "Outdoor Seating", type: "urn:tag:amenity:place", parents: ["urn:entity:place"], synonyms: ["patio", "garden"] },
  { id: "urn:tag:amenity:place:good_for_groups", name: "Good for Groups", type: "urn:tag:amenity:place", parents: ["urn:entity:place"], synonyms: ["group", "large party"] },
  { id: "urn:tag:amenity:place:games", name: "Games", type: "urn:tag:amenity:place", parents: ["urn:entity:place"], synonyms: ["arcade", "board games", "karaoke"] },
  // destinations
  { id: "urn:tag:genre:destination:beach", name: "Beach", type: "urn:tag:genre:destination", parents: ["urn:entity:destination"] },
  { id: "urn:tag:genre:destination:city_break", name: "City Break", type: "urn:tag:genre:destination", parents: ["urn:entity:destination"] },
  { id: "urn:tag:genre:destination:nature", name: "Nature", type: "urn:tag:genre:destination", parents: ["urn:entity:destination"], synonyms: ["outdoors", "hiking"] },
  { id: "urn:tag:genre:destination:food_scene", name: "Food Scene", type: "urn:tag:genre:destination", parents: ["urn:entity:destination"] },
];

// Vibe tags span every category: that is what makes cross-domain overlap work.
const ALL_TYPES = [
  "urn:entity:movie",
  "urn:entity:tv_show",
  "urn:entity:artist",
  "urn:entity:book",
  "urn:entity:place",
  "urn:entity:destination",
  "urn:entity:podcast",
  "urn:entity:videogame",
];
for (const [key, name] of Object.entries(VIBES)) {
  TAGS.push({ id: `urn:tag:style:qloo:${key}`, name, type: "urn:tag:style:qloo", parents: ALL_TYPES });
}

export const MOCK_TAGS: MockTag[] = TAGS;

type VibeSpec = string; // compact "dark3 cerebral1"

function vibes(spec: VibeSpec): VibeVector {
  const out: VibeVector = {};
  for (const part of spec.split(/\s+/).filter(Boolean)) {
    const m = /^([a-z]+)(\d)$/.exec(part);
    if (!m || !(m[1] in VIBES)) throw new Error(`bad vibe spec ${part}`);
    out[m[1] as Vibe] = Number(m[2]);
  }
  return out;
}

const T = (...ids: string[]) => ids.map((s) => (s.startsWith("urn:") ? s : `urn:tag:genre:media:${s}`));
const M = (...ids: string[]) => ids.map((s) => `urn:tag:genre:music:${s}`);
const B = (...ids: string[]) => ids.map((s) => `urn:tag:genre:book:${s}`);

const entities: MockEntity[] = [];
function add(e: Omit<MockEntity, "id"> & { idKind?: string }) {
  entities.push({ ...e, id: mockId(e.urn, e.name) });
}

function movie(name: string, year: number, genres: string[], spec: VibeSpec, popularity: number) {
  add({ name, urn: "urn:entity:movie", year, tags: T(...genres), vibes: vibes(spec), popularity });
}
function show(name: string, year: number, genres: string[], spec: VibeSpec, popularity: number) {
  add({ name, urn: "urn:entity:tv_show", year, tags: T(...genres), vibes: vibes(spec), popularity });
}
function artist(name: string, genres: string[], spec: VibeSpec, popularity: number) {
  add({ name, urn: "urn:entity:artist", tags: M(...genres), vibes: vibes(spec), popularity });
}
function book(name: string, author: string, year: number, genres: string[], spec: VibeSpec, popularity: number) {
  add({ name, urn: "urn:entity:book", year, disambiguation: author, tags: B(...genres), vibes: vibes(spec), popularity });
}
function place(
  name: string,
  category: "restaurant" | "bar" | "cafe",
  cuisine: string[],
  neighborhood: string,
  price: number,
  spec: VibeSpec,
  popularity: number,
  extra: string[] = [],
) {
  const tags = [
    `urn:tag:category:place:${category}`,
    ...cuisine.map((c) => (c.includes(":") ? c : `urn:tag:genre:place:restaurant:${c}`)),
    ...extra.map((x) =>
      x === "veg"
        ? "urn:tag:dining_options:place:vegetarian_friendly"
        : x === "cocktail" || x === "wine"
          ? `urn:tag:category:place:${x}_bar`
          : `urn:tag:amenity:place:${x}`,
    ),
  ];
  const number = 10 + ((entities.length * 37) % 380);
  add({
    name,
    urn: "urn:entity:place",
    tags,
    vibes: vibes(spec),
    popularity,
    place: { neighborhood, price, category, address: `${number} ${STREETS[entities.length % STREETS.length]}, New York, NY` },
  });
}
function destination(name: string, country: string, kinds: string[], spec: VibeSpec, popularity: number) {
  add({
    name,
    urn: "urn:entity:destination",
    country,
    tags: kinds.map((k) => `urn:tag:genre:destination:${k}`),
    vibes: vibes(spec),
    popularity,
  });
}
function other(urn: string, name: string, spec: VibeSpec, popularity: number, disambiguation?: string) {
  add({ name, urn, tags: [], vibes: vibes(spec), popularity, disambiguation });
}

const STREETS = ["Bedford Ave", "Orchard St", "Bleecker St", "Smith St", "Grand St", "Wythe Ave", "Ludlow St", "Mott St", "W 10th St", "Franklin Ave"];

// ---- Movies -------------------------------------------------------------
movie("Hereditary", 2018, ["horror", "drama"], "dark3 cerebral1", 0.9);
movie("Get Out", 2017, ["horror", "thriller"], "dark2 comedic1 cerebral2", 0.95);
movie("The Shining", 1980, ["horror"], "dark3 retro2", 0.96);
movie("Midsommar", 2019, ["horror", "drama"], "dark2 quirky2 cerebral1", 0.88);
movie("A Quiet Place", 2018, ["horror", "thriller"], "dark2 thrill2", 0.9);
movie("It Follows", 2014, ["horror"], "dark2 retro1 quirky1", 0.78);
movie("Scream", 1996, ["horror"], "dark2 retro2 comedic1", 0.88);
movie("The Babadook", 2014, ["horror", "drama"], "dark2 cerebral1", 0.76);
movie("Barbie", 2023, ["comedy"], "glam3 comedic2 quirky1", 0.97);
movie("Mamma Mia!", 2008, ["musical", "romance"], "glam2 romantic2 cozy1", 0.9);
movie("Crazy Rich Asians", 2018, ["romance", "comedy"], "glam2 romantic2 luxe2 worldly1", 0.89);
movie("The Devil Wears Prada", 2006, ["comedy", "drama"], "glam3 comedic1 luxe1", 0.92);
movie("La La Land", 2016, ["musical", "romance"], "romantic3 retro1 glam1", 0.94);
movie("Notting Hill", 1999, ["romance", "comedy"], "romantic2 cozy2 comedic1", 0.88);
movie("Pride & Prejudice", 2005, ["romance", "drama"], "romantic3 retro1 cerebral1", 0.9);
movie("About Time", 2013, ["romance", "comedy"], "romantic2 cozy2 quirky1", 0.82);
movie("The Grand Budapest Hotel", 2014, ["comedy"], "quirky3 retro2 luxe1", 0.93);
movie("Lady Bird", 2017, ["comedy", "drama"], "quirky2 cozy1 cerebral1", 0.86);
movie("Everything Everywhere All at Once", 2022, ["science_fiction", "comedy", "action"], "quirky3 geeky1 thrill1 worldly1", 0.94);
movie("Moonrise Kingdom", 2012, ["comedy", "romance"], "quirky3 retro1 romantic1", 0.84);
movie("Past Lives", 2023, ["romance", "drama"], "romantic2 cerebral2 worldly2", 0.83);
movie("Parasite", 2019, ["thriller", "drama"], "dark2 cerebral2 worldly2", 0.95);
movie("Amélie", 2001, ["comedy", "romance"], "quirky3 romantic2 worldly1 cozy1", 0.9);
movie("In the Mood for Love", 2000, ["romance", "drama"], "romantic3 cerebral2 worldly2 retro1", 0.8);
movie("Lost in Translation", 2003, ["drama", "comedy"], "cerebral2 quirky1 worldly2 romantic1", 0.86);
movie("Mad Max: Fury Road", 2015, ["action", "science_fiction"], "thrill3 dark1", 0.93);
movie("John Wick", 2014, ["action", "crime"], "thrill3 dark1 street1", 0.92);
movie("Top Gun: Maverick", 2022, ["action"], "thrill3 retro1", 0.95);
movie("Dune", 2021, ["science_fiction"], "geeky3 cerebral1 thrill1", 0.94);
movie("Interstellar", 2014, ["science_fiction", "drama"], "geeky3 cerebral2", 0.97);
movie("The Matrix", 1999, ["science_fiction", "action"], "geeky3 thrill2 retro1", 0.96);
movie("Spider-Man: Into the Spider-Verse", 2018, ["animation", "action"], "geeky2 street2 comedic1 thrill1", 0.93);
movie("Blade Runner 2049", 2017, ["science_fiction", "drama"], "geeky2 dark2 cerebral2", 0.88);
movie("Paddington 2", 2017, ["family", "comedy"], "cozy3 comedic2 quirky1", 0.87);
movie("Superbad", 2007, ["comedy"], "comedic3 street1", 0.88);
movie("Bridesmaids", 2011, ["comedy"], "comedic3 glam1", 0.87);
movie("The Princess Bride", 1987, ["comedy", "romance", "family"], "cozy2 comedic2 retro2 romantic1", 0.91);
movie("Little Miss Sunshine", 2006, ["comedy", "drama"], "quirky2 comedic2 cozy1", 0.85);
movie("Chef", 2014, ["comedy"], "cozy2 earthy1 street1 worldly1", 0.78);
movie("Casablanca", 1942, ["romance", "drama"], "retro3 romantic2", 0.9);
movie("Pulp Fiction", 1994, ["crime", "thriller"], "dark1 street2 retro2 comedic1", 0.97);
movie("Back to the Future", 1985, ["science_fiction", "comedy"], "retro3 geeky1 comedic1", 0.95);
movie("Jurassic Park", 1993, ["science_fiction", "action"], "thrill2 geeky2 retro2", 0.96);
movie("Moonlight", 2016, ["drama"], "cerebral2 romantic1 street1", 0.84);
movie("Call Me by Your Name", 2017, ["romance", "drama"], "romantic3 earthy1 cerebral1 worldly1", 0.85);
movie("Ratatouille", 2007, ["animation", "family"], "cozy2 worldly1 luxe1 comedic1", 0.93);
movie("Knives Out", 2019, ["crime", "comedy"], "comedic2 dark1 retro1 cozy1", 0.91);
movie("Oppenheimer", 2023, ["drama"], "cerebral3 dark1", 0.96);
movie("Spirited Away", 2001, ["animation", "family"], "quirky2 worldly2 cozy1 geeky1", 0.94);
movie("Booksmart", 2019, ["comedy"], "comedic3 quirky1 glam1", 0.8);

// ---- TV ------------------------------------------------------------------
show("Fleabag", 2016, ["comedy", "drama"], "comedic3 quirky1 cerebral1", 0.9);
show("The Bear", 2022, ["comedy", "drama"], "street1 earthy1 cerebral1 thrill1", 0.91);
show("Succession", 2018, ["drama", "comedy"], "dark1 cerebral2 luxe2 comedic1", 0.92);
show("Stranger Things", 2016, ["science_fiction", "horror"], "geeky2 retro3 dark1", 0.97);
show("The Office", 2005, ["comedy"], "comedic3 cozy2", 0.98);
show("Abbott Elementary", 2021, ["comedy"], "comedic2 cozy2", 0.86);
show("Ted Lasso", 2020, ["comedy"], "cozy3 comedic2", 0.91);
show("Schitt's Creek", 2015, ["comedy"], "cozy2 comedic3 glam1", 0.9);
show("Euphoria", 2019, ["drama"], "dark2 glam2 street1", 0.9);
show("Bridgerton", 2020, ["romance", "drama"], "romantic3 glam2 retro1", 0.92);
show("Gilmore Girls", 2000, ["comedy", "drama"], "cozy3 quirky1 comedic1", 0.9);
show("The White Lotus", 2021, ["comedy", "drama"], "luxe2 dark1 comedic1 worldly1", 0.9);
show("Severance", 2022, ["science_fiction", "thriller"], "cerebral2 dark1 geeky2 quirky1", 0.89);
show("Squid Game", 2021, ["thriller", "drama"], "dark2 thrill2 worldly2", 0.95);
show("Breaking Bad", 2008, ["crime", "drama"], "dark3 thrill1", 0.98);
show("The Great British Bake Off", 2010, ["reality"], "cozy3 earthy1", 0.88);
show("Only Murders in the Building", 2021, ["comedy", "crime"], "comedic2 cozy1 dark1 retro1", 0.88);
show("Atlanta", 2016, ["comedy", "drama"], "street3 quirky2 comedic1", 0.83);
show("Arcane", 2021, ["animation", "action"], "geeky3 thrill1 dark1", 0.88);
show("Emily in Paris", 2020, ["comedy", "romance"], "glam3 romantic2 worldly1", 0.87);
show("Normal People", 2020, ["romance", "drama"], "romantic3 cerebral1", 0.84);
show("Twin Peaks", 1990, ["crime", "drama"], "dark2 quirky3 retro1", 0.84);
show("Chef's Table", 2015, ["reality"], "luxe2 worldly2 earthy1 cerebral1", 0.8);
show("Queer Eye", 2018, ["reality"], "cozy2 glam1", 0.84);
show("The Last of Us", 2023, ["drama", "horror"], "dark2 geeky1 thrill1", 0.93);
show("Shōgun", 2024, ["drama", "action"], "worldly2 cerebral2 thrill1", 0.86);

// ---- Music ---------------------------------------------------------------
artist("Taylor Swift", ["pop"], "glam2 romantic2 cozy1", 0.99);
artist("Beyoncé", ["pop", "r_and_b"], "glam3 street1", 0.98);
artist("Harry Styles", ["pop", "rock"], "glam2 retro1 romantic1", 0.95);
artist("Olivia Rodrigo", ["pop", "rock"], "glam1 quirky1 romantic1 thrill1", 0.93);
artist("Dua Lipa", ["pop", "electronic"], "glam2 thrill2", 0.94);
artist("Bad Bunny", ["latin", "hip_hop"], "street2 worldly2 thrill1", 0.96);
artist("Kendrick Lamar", ["hip_hop"], "street3 cerebral2", 0.96);
artist("Frank Ocean", ["r_and_b"], "romantic2 cerebral2 street1", 0.9);
artist("SZA", ["r_and_b"], "romantic2 street1 glam1", 0.93);
artist("Tyler, The Creator", ["hip_hop"], "quirky2 street2 retro1", 0.91);
artist("Drake", ["hip_hop"], "street2 glam1", 0.97);
artist("Phoebe Bridgers", ["indie", "folk"], "dark1 quirky1 earthy1 cerebral1", 0.84);
artist("Bon Iver", ["indie", "folk"], "earthy3 cerebral1 cozy1", 0.85);
artist("Fleet Foxes", ["folk", "indie"], "earthy3 retro1", 0.76);
artist("Mitski", ["indie"], "dark1 quirky2 cerebral1", 0.85);
artist("Radiohead", ["rock"], "dark1 cerebral3 geeky1", 0.93);
artist("Arctic Monkeys", ["rock", "indie"], "retro1 street1 dark1 thrill1", 0.92);
artist("The Strokes", ["rock", "indie"], "retro2 street1", 0.86);
artist("Fleetwood Mac", ["rock"], "retro3 romantic1", 0.93);
artist("The Beatles", ["rock", "pop"], "retro3 cozy1", 0.97);
artist("Bruce Springsteen", ["rock"], "retro2 earthy1 street1", 0.9);
artist("Miles Davis", ["jazz"], "retro2 cerebral2 luxe1", 0.86);
artist("Norah Jones", ["jazz", "pop"], "cozy3 romantic1 retro1", 0.82);
artist("Nina Simone", ["jazz", "r_and_b"], "retro2 cerebral1 romantic1", 0.84);
artist("Daft Punk", ["electronic"], "thrill2 retro2 geeky1", 0.92);
artist("Fred again..", ["electronic"], "thrill3 street1", 0.84);
artist("Metallica", ["metal", "rock"], "dark3 thrill2 retro1", 0.93);
artist("Ghost", ["metal", "rock"], "dark3 quirky1 glam1", 0.8);
artist("Billie Eilish", ["pop"], "dark2 quirky1 glam1", 0.96);
artist("Lana Del Rey", ["pop", "indie"], "retro2 romantic2 dark1 glam1", 0.92);
artist("Hozier", ["rock", "folk"], "earthy2 romantic2 dark1", 0.88);
artist("Adele", ["pop"], "romantic3 cozy1", 0.96);
artist("Ed Sheeran", ["pop"], "romantic2 cozy2", 0.96);
artist("BTS", ["k_pop", "pop"], "glam2 thrill1 worldly2", 0.95);
artist("BLACKPINK", ["k_pop", "pop"], "glam3 thrill1 worldly1", 0.93);
artist("Rosalía", ["latin", "pop"], "worldly2 glam1 street1 quirky1", 0.87);
artist("Khruangbin", ["indie"], "worldly2 retro2 earthy1", 0.8);
artist("Hans Zimmer", ["electronic"], "geeky2 cerebral1 thrill1", 0.88);
artist("Joni Mitchell", ["folk"], "earthy2 retro2 cerebral1", 0.85);
artist("A Tribe Called Quest", ["hip_hop", "jazz"], "street2 retro2 cerebral1", 0.82);
artist("Chappell Roan", ["pop"], "glam3 quirky2 comedic1", 0.9);

// ---- Books -----------------------------------------------------------------
book("Normal People", "Sally Rooney", 2018, ["literary_fiction", "romance"], "romantic2 cerebral2", 0.88);
book("The Secret History", "Donna Tartt", 1992, ["literary_fiction", "mystery"], "dark2 cerebral3", 0.86);
book("Project Hail Mary", "Andy Weir", 2021, ["science_fiction"], "geeky3 comedic1", 0.9);
book("Dune", "Frank Herbert", 1965, ["science_fiction"], "geeky3 cerebral1", 0.94);
book("Pride and Prejudice", "Jane Austen", 1813, ["romance", "literary_fiction"], "romantic2 retro2 comedic1", 0.95);
book("Gone Girl", "Gillian Flynn", 2012, ["mystery"], "dark3 thrill1", 0.92);
book("The Night Circus", "Erin Morgenstern", 2011, ["fantasy", "romance"], "quirky2 romantic2 dark1", 0.85);
book("Kitchen Confidential", "Anthony Bourdain", 2000, ["nonfiction"], "street2 worldly2 earthy1 comedic1", 0.86);
book("Tomorrow, and Tomorrow, and Tomorrow", "Gabrielle Zevin", 2022, ["literary_fiction"], "geeky2 cerebral1 romantic1", 0.87);
book("Where the Crawdads Sing", "Delia Owens", 2018, ["literary_fiction", "mystery"], "earthy2 romantic1 dark1", 0.9);
book("Beach Read", "Emily Henry", 2020, ["romance"], "romantic2 cozy2 comedic1", 0.84);
book("The Seven Husbands of Evelyn Hugo", "Taylor Jenkins Reid", 2017, ["romance", "literary_fiction"], "glam2 romantic2 retro1", 0.9);
book("A Little Life", "Hanya Yanagihara", 2015, ["literary_fiction"], "dark2 cerebral2", 0.85);
book("Circe", "Madeline Miller", 2018, ["fantasy", "literary_fiction"], "worldly1 cerebral2 earthy1", 0.88);
book("The Hobbit", "J.R.R. Tolkien", 1937, ["fantasy"], "geeky2 cozy2", 0.95);
book("Klara and the Sun", "Kazuo Ishiguro", 2021, ["literary_fiction", "science_fiction"], "cerebral2 geeky1 quirky1", 0.82);
book("Educated", "Tara Westover", 2018, ["nonfiction"], "earthy2 cerebral2", 0.88);

// ---- Places (fictional, New York) ----------------------------------------
place("Marrow & Vine", "restaurant", ["italian"], "Williamsburg", 3, "romantic2 earthy2 cozy1", 0.88, ["veg", "wine"]);
place("Little Lantern", "restaurant", ["chinese"], "Chinatown", 1, "street2 cozy1 worldly2", 0.82, ["veg", "good_for_groups"]);
place("Hollow Bell", "bar", [], "Lower East Side", 2, "dark3 retro1 quirky1", 0.78, ["cocktail"]);
place("The Velvet Hour", "bar", [], "West Village", 3, "glam2 romantic2 luxe1 retro1", 0.84, ["cocktail", "live_music"]);
place("Saltgrass", "restaurant", ["seafood", "american"], "Greenpoint", 3, "earthy2 cozy1 retro1", 0.8, ["outdoor_seating"]);
place("Kiln", "restaurant", ["middle_eastern"], "Park Slope", 2, "earthy2 worldly2 cozy1", 0.8, ["veg", "good_for_groups"]);
place("Neon Tiger", "restaurant", ["korean"], "Koreatown", 2, "thrill2 street1 glam1 worldly1", 0.86, ["good_for_groups", "games"]);
place("Oda House", "restaurant", ["japanese"], "East Village", 2, "quirky1 cerebral1 worldly2", 0.79, ["veg"]);
place("Brass Tacks", "restaurant", ["american"], "Bushwick", 1, "street2 comedic1 retro1", 0.77, ["good_for_groups", "games"]);
place("Maison Fleur", "restaurant", ["french"], "SoHo", 4, "luxe3 romantic2 glam1", 0.9, []);
place("Gilded Pig", "restaurant", ["steakhouse"], "Flatiron", 4, "luxe2 retro2", 0.85, []);
place("Taquería Luz", "restaurant", ["mexican"], "Bushwick", 1, "street2 worldly1 thrill1", 0.83, ["veg", "outdoor_seating"]);
place("Paper Moon Diner", "restaurant", ["american"], "Astoria", 1, "retro3 cozy2 comedic1", 0.76, ["good_for_groups"]);
place("Saffron Room", "restaurant", ["indian"], "Murray Hill", 2, "worldly2 cozy1 romantic1", 0.81, ["veg"]);
place("Basil & Bone", "restaurant", ["thai"], "Hell's Kitchen", 2, "street1 worldly2 thrill1", 0.8, ["veg"]);
place("Wren", "restaurant", ["american"], "Tribeca", 4, "luxe2 cerebral2 earthy1", 0.87, ["veg"]);
place("Moth & Moon", "bar", [], "Bushwick", 2, "dark2 quirky2 street1", 0.74, ["cocktail", "live_music"]);
place("Static", "bar", [], "Williamsburg", 2, "thrill3 street1 glam1", 0.82, ["games"]);
place("The Reading Room", "bar", [], "Upper West Side", 2, "cozy2 cerebral2 retro1", 0.72, ["wine"]);
place("Cellar 9", "bar", [], "East Village", 2, "earthy2 romantic1 quirky1", 0.75, ["wine"]);
place("Blue Hour", "bar", [], "Harlem", 2, "retro2 romantic2 cerebral1", 0.8, ["live_music", "cocktail"]);
place("Pixel Pint", "bar", [], "Greenpoint", 1, "geeky3 comedic1 street1", 0.71, ["games", "good_for_groups"]);
place("Rooftop Nine", "bar", [], "Midtown", 3, "glam3 thrill1 luxe1", 0.85, ["rooftop", "cocktail"]);
place("Ghost Kitchen Club", "restaurant", ["japanese", "american"], "Lower East Side", 2, "dark2 quirky2 geeky1", 0.73, ["good_for_groups"]);
place("Sunday Table", "restaurant", ["italian"], "Carroll Gardens", 2, "cozy3 romantic1 retro1", 0.83, ["veg", "good_for_groups"]);
place("Ember Lane", "restaurant", ["american", "seafood"], "West Village", 3, "romantic2 cozy2 earthy1", 0.86, ["veg"]);
place("Sakura Alley", "restaurant", ["japanese"], "West Village", 4, "luxe2 cerebral2 worldly2", 0.88, []);
place("Copper Kettle", "cafe", ["american"], "Park Slope", 1, "cozy3 quirky1", 0.7, ["veg"]);
place("Midnight Noodle", "restaurant", ["chinese", "korean"], "East Village", 1, "street2 thrill1 dark1", 0.78, ["veg", "good_for_groups"]);
place("La Sirena Verde", "restaurant", ["mexican", "seafood"], "Red Hook", 2, "worldly2 earthy1 romantic1", 0.76, ["outdoor_seating"]);
place("Orbit Room", "bar", [], "Lower East Side", 2, "geeky2 retro2 quirky1", 0.73, ["cocktail", "games"]);
place("Fig & Thistle", "restaurant", ["middle_eastern", "french"], "Fort Greene", 3, "cerebral1 earthy2 romantic1 worldly1", 0.79, ["veg", "wine"]);
place("Gold Coast Supper Club", "restaurant", ["american"], "Midtown", 4, "glam3 luxe2 retro1", 0.84, ["live_music"]);
place("Pit & Ash", "restaurant", ["american"], "Gowanus", 2, "street2 thrill1 earthy1", 0.79, ["good_for_groups", "outdoor_seating"]);
place("Lumen", "restaurant", ["korean", "french"], "Chelsea", 3, "cerebral2 quirky2 luxe1", 0.81, ["veg"]);
place("Velour", "bar", [], "SoHo", 3, "glam3 romantic1 dark1", 0.8, ["cocktail"]);
place("The Lantern Tap", "bar", [], "Astoria", 1, "cozy2 comedic2 street1", 0.72, ["good_for_groups", "games"]);
place("Thornbury", "restaurant", ["french"], "Cobble Hill", 3, "dark1 romantic2 retro2 cerebral1", 0.78, ["wine"]);
place("Seoul Garden Rooftop", "restaurant", ["korean"], "Koreatown", 3, "glam2 worldly2 thrill1", 0.82, ["rooftop", "good_for_groups"]);
place("Verdant", "restaurant", ["american"], "Flatiron", 3, "earthy3 cerebral1 cozy1", 0.82, ["veg"]);

// ---- Destinations ----------------------------------------------------------
destination("Lisbon", "Portugal", ["city_break", "food_scene"], "worldly2 romantic1 retro1 earthy1", 0.92);
destination("Mexico City", "Mexico", ["city_break", "food_scene"], "worldly2 street2 thrill1", 0.93);
destination("Kyoto", "Japan", ["city_break"], "cerebral2 worldly2 cozy1", 0.94);
destination("Reykjavík", "Iceland", ["nature"], "earthy3 quirky1 cerebral1", 0.86);
destination("New Orleans", "United States", ["city_break", "food_scene"], "retro2 thrill1 dark1 worldly1", 0.9);
destination("Marfa", "United States", ["nature"], "quirky3 cerebral2 earthy1", 0.7);
destination("Copenhagen", "Denmark", ["city_break", "food_scene"], "cozy2 cerebral1 luxe1 earthy1", 0.88);
destination("Tulum", "Mexico", ["beach"], "glam2 earthy2 luxe1", 0.87);
destination("Hudson Valley", "United States", ["nature", "food_scene"], "earthy3 cozy2", 0.8);
destination("Montreal", "Canada", ["city_break", "food_scene"], "worldly1 cozy1 quirky1 retro1", 0.85);
destination("Nashville", "United States", ["city_break"], "retro2 thrill2 comedic1", 0.87);
destination("Barcelona", "Spain", ["city_break", "beach"], "worldly2 glam1 thrill1 street1", 0.94);

// ---- Other likes people often list --------------------------------------
other("urn:entity:podcast", "SmartLess", "comedic3 glam1", 0.88);
other("urn:entity:podcast", "Serial", "dark2 cerebral2", 0.87);
other("urn:entity:podcast", "Hardcore History", "cerebral3 geeky1 dark1", 0.8);
other("urn:entity:podcast", "Radiolab", "cerebral2 geeky2 quirky1", 0.8);
other("urn:entity:videogame", "Stardew Valley", "cozy3 earthy2", 0.88);
other("urn:entity:videogame", "Elden Ring", "dark2 geeky3 thrill1", 0.9);
other("urn:entity:videogame", "Animal Crossing: New Horizons", "cozy3 quirky2", 0.9);
other("urn:entity:videogame", "The Legend of Zelda: Breath of the Wild", "geeky2 earthy2 thrill1", 0.94);

export const MOCK_ENTITIES: MockEntity[] = entities;
