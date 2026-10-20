import { beforeAll, describe, expect, it } from "vitest";
import type { Person } from "../shared/types";
import { Qloo, clearQlooCache } from "../server/qloo/client";
import { mockTransport } from "../server/qloo/mock";
import { planSlot } from "../server/engine/planner";
import { analyzeGroupTaste } from "../server/engine/taste";

const qloo = () => new Qloo(mockTransport());
let group: Person[];

async function like(name: string, type: string) {
  const [hit] = await qloo().search(name, { types: [type], take: 1 });
  if (!hit) throw new Error(`mock has no ${name}`);
  return hit;
}

beforeAll(async () => {
  clearQlooCache();
  group = [
    { id: "a", name: "Priya", color: 0, likes: [await like("Fleabag", "urn:entity:tv_show"), await like("Phoebe Bridgers", "urn:entity:artist")] },
    { id: "b", name: "Marco", color: 1, likes: [await like("Hereditary", "urn:entity:movie"), await like("Metallica", "urn:entity:artist")] },
    { id: "c", name: "Jun", color: 2, likes: [await like("Taylor Swift", "urn:entity:artist"), await like("Notting Hill", "urn:entity:movie")] },
  ];
});

describe("mock Qloo API", () => {
  it("answers the documented request shapes", async () => {
    const q = qloo();
    const movies = await q.insights({ "filter.type": "urn:entity:movie", "signal.interests.entities": [group[1].likes[0].id], "feature.explainability": true, take: 5 });
    expect(movies.entities).toHaveLength(5);
    expect(movies.entities[0].affinity).toBeGreaterThan(0);
    expect(movies.entities[0].explain.get(group[1].likes[0].id)).toBeGreaterThan(0);

    const ids = movies.entities.slice(0, 3).map((e) => e.id);
    const scored = await q.insights({ "filter.type": "urn:entity:movie", "signal.interests.entities": [group[2].likes[0].id], "filter.results.entities": ids });
    expect(scored.entities.map((e) => e.id).sort()).toEqual([...ids].sort());

    const tags = await q.insights({ "filter.type": "urn:tag", "signal.interests.entities": [group[0].likes[0].id] });
    expect(tags.tags.length).toBeGreaterThan(0);
    await expect(q.insights({ "filter.type": "urn:entity:music" })).rejects.toMatchObject({ status: 403 });
    expect((await q.findTags("vegetarian")).map((t) => t.id)).toContain("urn:tag:dining_options:place:vegetarian_friendly");
    expect((await q.compare([group[0].likes[0].id], [group[2].likes[1].id])).length).toBeGreaterThan(0);
  });
});

describe("planSlot", () => {
  it("scores one shared shortlist for every person and ranks it fairly", async () => {
    const r = await planSlot(qloo(), { slot: "movie", group });
    expect(r.poolSize).toBeGreaterThan(10);
    expect(r.candidates.length).toBeGreaterThan(0);
    for (const c of r.candidates) {
      expect(Object.keys(c.percentiles).sort()).toEqual(["a", "b", "c"]);
      for (const p of Object.values(c.percentiles)) expect(p).toBeGreaterThanOrEqual(0), expect(p).toBeLessThanOrEqual(1);
    }
    // fair options come first, ordered by group score
    const firstUnfair = r.candidates.findIndex((c) => !c.fair);
    if (firstUnfair >= 0) expect(r.candidates.slice(firstUnfair).every((c) => !c.fair)).toBe(true);
    const fair = r.candidates.filter((c) => c.fair);
    for (let i = 1; i < fair.length; i++) expect(fair[i - 1].groupScore).toBeGreaterThanOrEqual(fair[i].groupScore);
    // favourites aren't recommended back, and the comparison data is there
    const liked = new Set(group.flatMap((p) => p.likes.map((l) => l.id)));
    expect(r.candidates.some((c) => liked.has(c.entity.id))).toBe(false);
    expect(r.popularBaseline).toBeDefined();
    expect(Object.keys(r.personalTop).sort()).toEqual(["a", "b", "c"]);
  });

  it("beats the popular default on the least-happy person", async () => {
    const r = await planSlot(qloo(), { slot: "movie", group });
    expect(r.candidates[0].minPercentile).toBeGreaterThanOrEqual(r.popularBaseline!.minPercentile);
  });

  it("credits picks to people through explainability", async () => {
    const r = await planSlot(qloo(), { slot: "dinner", group, location: "New York City" });
    const top = r.candidates[0];
    const total = Object.values(top.attribution).reduce((s, x) => s + x, 0);
    expect(total).toBeGreaterThan(0.9);
    expect(top.drivers.length).toBeGreaterThan(0);
    expect(new Set(top.drivers.slice(0, 2).map((d) => d.personId)).size).toBe(2);
  });

  it("applies filters: location, tags and price", async () => {
    const r = await planSlot(qloo(), { slot: "dinner", group, location: "Brooklyn", includeTagIds: ["urn:tag:dining_options:place:vegetarian_friendly"], priceMax: 2 });
    expect(r.candidates.length).toBeGreaterThan(0);
    for (const c of r.candidates) expect(c.entity.priceLevel).toBeLessThanOrEqual(2);
    expect(r.filters["filter.price_level.max"]).toBe("2");
  });

  it("says so when Qloo has nothing for a place", async () => {
    const r = await planSlot(qloo(), { slot: "drinks", group, location: "Atlantis" });
    expect(r.candidates).toHaveLength(0);
    expect(r.notes.join(" ")).toMatch(/no drinks options/i);
  });

  it("uses fairness-ledger weights", async () => {
    const even = await planSlot(qloo(), { slot: "movie", group });
    const tilted = await planSlot(qloo(), { slot: "movie", group, weights: { a: 0.75, b: 0.75, c: 1.5 } });
    expect(tilted.weights.c).toBe(1.5);
    expect(tilted.candidates[0].percentiles.c).toBeGreaterThanOrEqual(even.candidates[0].percentiles.c - 1e-9);
  });
});

describe("analyzeGroupTaste", () => {
  it("finds per-person fingerprints, shared tags and tensions", async () => {
    const t = await analyzeGroupTaste(qloo(), group);
    expect(t.people).toHaveLength(3);
    for (const p of t.people) expect(p.topTags.length).toBeGreaterThan(0);
    expect(t.tensions.length).toBeGreaterThan(0);
    for (const tag of t.shared) expect(Math.min(...Object.values(tag.byPerson))).toBeGreaterThanOrEqual(0.45);
  });

  it("adds Qloo's compare endpoint for pairs", async () => {
    const t = await analyzeGroupTaste(qloo(), group.slice(0, 2));
    expect(t.pairShared?.length).toBeGreaterThan(0);
  });
});
