import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Person, PlanEvent } from "../shared/types";
import { runPlan, sanitize } from "../server/agent/run";
import type { LlmProvider, LlmSession, TurnResult } from "../server/agent/providers";
import { loadConfig } from "../server/config";
import { Qloo, clearQlooCache } from "../server/qloo/client";
import { mockTransport } from "../server/qloo/mock";
import { allow, resetRateLimits } from "../server/http/rateLimit";

const config = loadConfig({});
let group: Person[];

beforeAll(async () => {
  clearQlooCache();
  const q = new Qloo(mockTransport());
  const like = async (name: string, type: string) => (await q.search(name, { types: [type], take: 1 }))[0];
  group = [
    { id: "a", name: "Priya", color: 0, likes: [await like("Fleabag", "urn:entity:tv_show"), await like("Lady Bird", "urn:entity:movie")] },
    { id: "b", name: "Marco", color: 1, likes: [await like("Hereditary", "urn:entity:movie"), await like("Metallica", "urn:entity:artist")] },
  ];
});

async function collect(body: Parameters<typeof runPlan>[0], provider?: LlmProvider | null, loopLimitMs?: number) {
  const events: PlanEvent[] = [];
  await runPlan(body, config, (e) => events.push(e), { provider, loopLimitMs });
  return events;
}

/** A provider that replays a fixed script of turns, for testing the loop without a model. */
function scripted(turns: Array<(lastToolResults: string[]) => TurnResult>): LlmProvider & { sent: unknown[][] } {
  const sent: unknown[][] = [];
  return {
    name: "scripted",
    model: "test",
    sent,
    session(): LlmSession {
      const messages: unknown[] = [];
      let i = 0;
      let last: string[] = [];
      return {
        get messages() {
          return messages;
        },
        addUser(text) {
          messages.push({ role: "user", content: text });
        },
        addToolResults(results) {
          last = results.map((r) => r.content);
          messages.push({ role: "user", content: results });
        },
        async turn() {
          sent.push([...messages]);
          const t = turns[Math.min(i++, turns.length - 1)](last);
          messages.push({ role: "assistant", content: t });
          return t;
        },
      };
    },
  };
}

beforeEach(() => resetRateLimits());

describe("rule-based planner (no model)", () => {
  it("streams the whole run and ends with a plan, history and done", async () => {
    const events = await collect({ group, slots: ["dinner", "movie"], location: "Brooklyn", notes: "One vegetarian. Nothing too pricey." }, null);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("status");
    expect(types).toContain("taste");
    expect(types.filter((t) => t === "slot")).toHaveLength(2);
    expect(types.at(-2)).toBe("history");
    expect(types.at(-1)).toBe("done");
    const plan = events.find((e) => e.type === "plan");
    expect(plan && plan.type === "plan" && plan.plan.items.map((i) => i.slot).sort()).toEqual(["dinner", "movie"]);
    const receipts = events.filter((e) => e.type === "qloo");
    expect(receipts.length).toBeGreaterThan(10);
    // the notes became Qloo filters
    const tagSearch = receipts.find((e) => e.type === "qloo" && e.receipt.path === "/v2/tags" && e.receipt.params["filter.query"] === "vegetarian");
    expect(tagSearch).toBeDefined();
    const dinner = events.find((e) => e.type === "slot" && e.result.slot === "dinner");
    expect(dinner && dinner.type === "slot" && dinner.result.filters["filter.price_level.max"]).toBe("2");
  });

  it("asks for favourites instead of planning on nothing", async () => {
    const events = await collect({ group: [{ id: "x", name: "Empty", color: 0, likes: [] }], slots: ["movie"] }, null);
    expect(events.some((e) => e.type === "plan")).toBe(false);
    expect(events.some((e) => e.type === "message" && /favourite/i.test(e.text))).toBe(true);
  });
});

describe("model-driven agent loop", () => {
  it("runs the tools the model asks for and publishes a validated plan", async () => {
    const provider = scripted([
      () => ({ text: "", thinking: ["Reading tastes first."], stop: "tool_use", toolCalls: [{ id: "t1", name: "read_group_taste", input: {} }] }),
      () => ({
        text: "",
        thinking: [],
        stop: "tool_use",
        toolCalls: [
          {
            id: "t2",
            name: "plan_slot",
            input: { slot: "movie", location: null, include_tag_ids: [], include_mode: "all", exclude_tag_ids: [], max_price_level: null, min_price_level: null, content_ratings: [], release_year_min: null, release_year_max: null, exclude_entity_ids: [] },
          },
        ],
      }),
      (last) => {
        const ref = JSON.parse(last[0]).options[0].ref;
        return {
          text: "",
          thinking: [],
          stop: "tool_use",
          toolCalls: [{ id: "t3", name: "finalize_plan", input: { title: "Movie night", summary: "A fair pick.", items: [{ slot: "movie", ref, why: "Both of you rank it high.", tradeoff: null }], note_for_group: null, reply: "Here's your movie night." } }],
        };
      },
      () => {
        throw new Error("the run should end at finalize_plan without another model call");
      },
    ]);
    const events = await collect({ group, slots: ["movie"] }, provider);
    expect(provider.sent).toHaveLength(3);
    expect(events.find((e) => e.type === "status")).toMatchObject({ status: { llm: "scripted", model: "test" } });
    expect(events.some((e) => e.type === "thinking")).toBe(true);
    const plan = events.find((e) => e.type === "plan");
    expect(plan && plan.type === "plan" && plan.plan.title).toBe("Movie night");
    expect(events.some((e) => e.type === "message" && e.text === "Here's your movie night.")).toBe(true);
    const history = events.find((e) => e.type === "history");
    expect(history && history.type === "history" && history.history.provider).toBe("scripted");
  });

  it("rejects a pick that isn't on the scored shortlist, then recovers", async () => {
    const provider = scripted([
      () => ({ text: "", thinking: [], stop: "tool_use", toolCalls: [{ id: "t1", name: "plan_slot", input: { slot: "movie" } }] }),
      () => ({ text: "", thinking: [], stop: "tool_use", toolCalls: [{ id: "t2", name: "finalize_plan", input: { title: "T", summary: "S", items: [{ slot: "movie", ref: "movie-99", why: "x", tradeoff: null }], note_for_group: null } }] }),
      (last) => {
        expect(JSON.parse(last[0])).toMatchObject({ ok: false });
        return { text: "", thinking: [], stop: "tool_use", toolCalls: [{ id: "t3", name: "finalize_plan", input: { title: "T", summary: "S", items: [{ slot: "movie", ref: "movie-1", why: "x", tradeoff: null }], note_for_group: null, reply: "Done." } }] };
      },
      () => ({ text: "Done.", thinking: [], stop: "end", toolCalls: [] }),
    ]);
    const events = await collect({ group, slots: ["movie"] }, provider);
    const plans = events.filter((e) => e.type === "plan");
    expect(plans).toHaveLength(1);
  });

  it("falls back to the rule-based planner if the model stops without a plan", async () => {
    const provider = scripted([() => ({ text: "I'm not sure.", thinking: [], stop: "end", toolCalls: [] })]);
    const events = await collect({ group, slots: ["movie"] }, provider);
    expect(events.some((e) => e.type === "plan")).toBe(true);
  });

  it("falls back if the model API is unavailable", async () => {
    const broken: LlmProvider = {
      name: "broken",
      model: "x",
      session: () => ({
        messages: [],
        addUser() {},
        addToolResults() {},
        async turn() {
          const { LlmUnavailableError } = await import("../server/agent/providers");
          throw new LlmUnavailableError("The Anthropic API key was rejected.", false);
        },
      }),
    };
    const events = await collect({ group, slots: ["movie"] }, broken);
    expect(events.some((e) => e.type === "status" && /rejected/.test(e.status.notice ?? ""))).toBe(true);
    expect(events.some((e) => e.type === "plan")).toBe(true);
  });
});

describe("watchdog", () => {
  it("abandons a model call that never returns and still publishes a plan", async () => {
    const stuck: LlmProvider = {
      name: "stuck",
      model: "x",
      session: () => ({
        messages: [],
        addUser() {},
        addToolResults() {},
        turn: () => new Promise<TurnResult>(() => {}),
      }),
    };
    const events = await collect({ group, slots: ["movie"] }, stuck, 200);
    expect(events.some((e) => e.type === "status" && /took too long/.test(e.status.notice ?? ""))).toBe(true);
    expect(events.some((e) => e.type === "plan")).toBe(true);
    const history = events.find((e) => e.type === "history");
    expect(history && history.type === "history" && history.history.messages).toEqual([]);
    expect(events.at(-1)?.type).toBe("done");
  });
});

describe("input limits", () => {
  it("caps sizes and de-duplicates names", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, name: "Sam", color: i, likes: [] }));
    const s = sanitize({ group: many, slots: ["movie", "movie", "nonsense" as never] });
    expect(s.group).toHaveLength(6);
    expect(new Set(s.group.map((p) => p.name)).size).toBe(6);
    expect(s.slots).toEqual(["movie"]);
  });

  it("rate-limits per client", () => {
    for (let i = 0; i < 3; i++) expect(allow("k", 3)).toBe(true);
    expect(allow("k", 3)).toBe(false);
    expect(allow("other", 3)).toBe(true);
  });
});
