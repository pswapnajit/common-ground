import { beforeEach, describe, expect, it } from "vitest";
import { Qloo, QlooError, clearQlooCache, toQuery, type QlooTransport } from "../server/qloo/client";
import { parseExplainability, resultArray, toEntityCard, toTag } from "../server/qloo/normalize";
import { loadConfig } from "../server/config";

function fakeTransport(handler: (path: string, q: URLSearchParams) => { status: number; body: unknown }) {
  const calls: string[] = [];
  const t: QlooTransport = {
    mode: "live",
    async get(path, q) {
      calls.push(`${path}?${q}`);
      return handler(path, q);
    },
  };
  return { t, calls };
}

beforeEach(() => clearQlooCache());

describe("toQuery", () => {
  it("comma-joins arrays, drops empty values and sorts keys (stable cache keys)", () => {
    const q = toQuery({ take: 5, "signal.interests.entities": ["A", "B"], "filter.tags": [], empty: "", none: undefined, "filter.type": "urn:entity:movie" });
    expect(q.toString()).toBe("filter.type=urn%3Aentity%3Amovie&signal.interests.entities=A%2CB&take=5");
  });
});

describe("Qloo client", () => {
  it("records a receipt per call and serves repeats from the private cache", async () => {
    const { t, calls } = fakeTransport(() => ({ status: 200, body: { success: true, results: { entities: [{ entity_id: "E1", name: "X", subtype: "urn:entity:movie" }] } } }));
    const receipts: string[] = [];
    const qloo = new Qloo(t, (r) => receipts.push(`${r.path}:${r.cached}`));
    await qloo.insights({ "filter.type": "urn:entity:movie", "signal.interests.entities": ["A"] });
    await qloo.insights({ "signal.interests.entities": ["A"], "filter.type": "urn:entity:movie" });
    expect(calls).toHaveLength(1);
    expect(receipts).toEqual(["/v2/insights:false", "/v2/insights:true"]);
  });

  it("de-duplicates identical requests in flight", async () => {
    const { t, calls } = fakeTransport(() => ({ status: 200, body: { results: [] } }));
    const qloo = new Qloo(t);
    await Promise.all([qloo.search("Dune"), qloo.search("Dune"), qloo.search("Dune")]);
    expect(calls).toHaveLength(1);
  });

  it("raises QlooError with the HTTP status and does not cache failures", async () => {
    let n = 0;
    const { t } = fakeTransport(() => (n++ === 0 ? { status: 403, body: { message: "You do not have permission to access urn:entity:music" } } : { status: 200, body: { results: [] } }));
    const qloo = new Qloo(t);
    await expect(qloo.insights({ "filter.type": "urn:entity:music" })).rejects.toMatchObject({ name: "QlooError", status: 403 });
    await expect(qloo.insights({ "filter.type": "urn:entity:music" })).resolves.toBeTruthy();
  });

  it("never sends the API key as a parameter", async () => {
    const { t, calls } = fakeTransport(() => ({ status: 200, body: { results: [] } }));
    await new Qloo(t).search("anything");
    expect(calls[0]).not.toMatch(/key/i);
  });

  it("QlooError is an Error", () => {
    expect(new QlooError("x", 401, "/v2/insights")).toBeInstanceOf(Error);
  });
});

describe("normalize", () => {
  it("reads search results (flat array, types[]) and insights results (results.entities, subtype)", () => {
    const search = { results: [{ name: "Balthazar", entity_id: "FCE8", types: ["urn:entity:place"], popularity: 0.99, properties: { price_level: 3, geocode: { neighborhood: "SoHo", city: "New York" } } }] };
    const insights = { success: true, results: { entities: [{ name: "Dune", entity_id: "D1", type: "urn:entity", subtype: "urn:entity:movie", properties: { release_year: 2021, image: { url: "https://img" } }, query: { affinity: 0.93 } }] } };
    const place = toEntityCard(resultArray(search, "entities")[0]);
    expect(place).toMatchObject({ id: "FCE8", kind: "place", priceLevel: 3, neighborhood: "SoHo", subtitle: "SoHo · $$$" });
    const movie = toEntityCard(resultArray(insights, "entities")[0]);
    expect(movie).toMatchObject({ id: "D1", kind: "movie", subtitle: "2021", image: "https://img", affinity: 0.93 });
  });

  it("drops noisy tag families from entity cards", () => {
    const card = toEntityCard({
      entity_id: "E",
      name: "Film",
      subtype: "urn:entity:movie",
      tags: [
        { id: "urn:tag:streaming_service:media:neon_tv", name: "Neon Tv", type: "urn:tag:streaming_service:media" },
        { id: "urn:tag:keyword:media:multiverse", name: "Multiverse", type: "urn:tag:keyword:media" },
      ],
    });
    expect(card.tags!.map((t) => t.name)).toEqual(["Multiverse"]);
  });

  it("reads tags from taste analysis (tag_id, query.affinity) and compare (query.score)", () => {
    expect(toTag({ tag_id: "urn:tag:ambience:qloo:intimate", name: "Intimate", subtype: "urn:tag:ambience:qloo", query: { affinity: 0.992 } })).toMatchObject({ id: "urn:tag:ambience:qloo:intimate", affinity: 0.992 });
    expect(toTag({ tag_id: "urn:tag:style:qloo:athletic", name: "Athletic", query: { score: 0.729 } }).affinity).toBe(0.729);
    expect(toTag({ id: "urn:tag:amenity:place:rooftop_bar", name: "Rooftop Bar", type: "urn:tag:amenity:place" }).id).toBe("urn:tag:amenity:place:rooftop_bar");
  });

  it("parses explainability in several plausible shapes", () => {
    const listShape = { query: { explainability: { "signal.interests.entities": [{ entity_id: "A", score: 0.8 }, { entity_id: "B", score: 0.2 }] } } };
    const keyedShape = { query: { explainability: { "signal.interests.entities": { "0B7E9C2A-1111-4222-8333-444455556666": 0.5 } } } };
    expect([...parseExplainability(listShape)]).toEqual([["A", 0.8], ["B", 0.2]]);
    expect(parseExplainability(keyedShape).get("0B7E9C2A-1111-4222-8333-444455556666")).toBe(0.5);
    expect(parseExplainability({ query: {} }).size).toBe(0);
  });
});

describe("config", () => {
  it("switches to live with one line: setting QLOO_API_KEY", () => {
    expect(loadConfig({}).qloo.mode).toBe("mock");
    expect(loadConfig({ QLOO_API_KEY: "k" }).qloo.mode).toBe("live");
    expect(loadConfig({ QLOO_API_KEY: "k", QLOO_MODE: "mock" }).qloo.mode).toBe("mock");
    expect(loadConfig({ QLOO_MODE: "live" }).qloo.mode).toBe("mock"); // live needs a key
    expect(loadConfig({}).qloo.baseUrl).toBe("https://hackathon.api.qloo.com");
  });

  it("defaults to Claude and falls back to the rule-based planner without a key", () => {
    expect(loadConfig({ ANTHROPIC_API_KEY: "a" }).llm).toMatchObject({ provider: "anthropic", model: "claude-opus-5-5" });
    expect(loadConfig({}).llm.provider).toBe("offline");
    expect(loadConfig({ LLM_PROVIDER: "openai", OPENAI_API_KEY: "o" }).llm.provider).toBe("offline"); // needs LLM_MODEL
    expect(loadConfig({ LLM_PROVIDER: "openai", OPENAI_API_KEY: "o", LLM_MODEL: "m" }).llm).toMatchObject({ provider: "openai", model: "m" });
  });
});
