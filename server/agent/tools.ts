// The agent's tools. Each one wraps Qloo-backed engine code, emits progress
// events for the UI, and returns compact JSON for the model to read.

import { z } from "zod";
import type { GroupTaste, Person, Plan, PlanEvent, SlotKind, SlotResult } from "../../shared/types.js";
import { SLOT_LABELS } from "../../shared/types.js";
import type { Qloo } from "../qloo/client.js";
import { planSlot } from "../engine/planner.js";
import { SLOTS } from "../engine/slots.js";
import { analyzeGroupTaste } from "../engine/taste.js";
import { compactSlot, compactTaste, nameLookup, tradeoffText, whyText, type NameOf } from "./describe.js";

export const SLOT_KINDS = ["dinner", "drinks", "movie", "series", "music", "book", "trip"] as const;

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface RunContext {
  qloo: Qloo;
  group: Person[];
  slots: SlotKind[];
  location?: string;
  weights: Record<string, number>;
  vetoes: Partial<Record<SlotKind, string[]>>;
  emit: (e: PlanEvent) => void;
  nameOf: NameOf;
  taste?: GroupTaste;
  slotResults: Partial<Record<SlotKind, SlotResult>>;
  /** Slots planned during this run (as opposed to restored from the last one). */
  freshSlots: Set<SlotKind>;
  plan?: Plan;
}

export function makeContext(
  args: Omit<RunContext, "nameOf" | "slotResults" | "freshSlots"> & { slotResults?: RunContext["slotResults"] },
): RunContext {
  return { ...args, nameOf: nameLookup(args.group), slotResults: args.slotResults ?? {}, freshSlots: new Set() };
}

const nullableInt = { anyOf: [{ type: "integer" }, { type: "null" }] };
const stringList = { type: "array", items: { type: "string" } };

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: "read_group_taste",
    description:
      "Reads every person's taste fingerprint from Qloo (taste analysis over their favourites), the tags the whole group shares, and tension tags that only one person loves. Call this once at the start of a plan.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "find_qloo_tags",
    description:
      "Searches Qloo's tag catalogue for a concept in the user's notes (for example 'vegetarian', 'rooftop', 'horror', 'outdoor seating') so it can be used as a filter. Returns candidate tag ids. Only use a tag whose name clearly matches the concept.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The concept to look up, in a few words." },
        slot: { type: "string", enum: [...SLOT_KINDS], description: "Which plan item the tag is for." },
      },
      required: ["query", "slot"],
      additionalProperties: false,
    },
  },
  {
    name: "plan_slot",
    description:
      "Plans one item for the group with Qloo: builds a shortlist from everyone's favourites, scores the shortlist separately for each person, and ranks it fairly (nobody below a misery floor, then the best weighted geometric mean). Returns ranked options with each person's percentile, whose favourites pulled each option up, the most popular option for comparison, and each person's own number one. Call it once per requested item; independent items can be planned in parallel.",
    input_schema: {
      type: "object",
      properties: {
        slot: { type: "string", enum: [...SLOT_KINDS] },
        location: { anyOf: [{ type: "string" }, { type: "null" }], description: "City or neighbourhood for dinner and drinks; null for other items." },
        include_tag_ids: { ...stringList, description: "Qloo tag ids every result must carry (from find_qloo_tags). Empty if none." },
        include_mode: { type: "string", enum: ["all", "any"], description: "'all' = results must match every include tag; 'any' = at least one (use for alternatives like two cuisines)." },
        exclude_tag_ids: { ...stringList, description: "Qloo tag ids to exclude (from find_qloo_tags). Empty if none." },
        max_price_level: { ...nullableInt, description: "Dinner/drinks only: 1-4 ($ to $$$$), or null." },
        min_price_level: { ...nullableInt, description: "Dinner/drinks only: 1-4, or null." },
        content_ratings: { ...stringList, description: "Movie/series only, e.g. ['G','PG','PG-13']. Empty for no restriction." },
        release_year_min: nullableInt,
        release_year_max: nullableInt,
        exclude_entity_ids: { ...stringList, description: "Entity ids to leave out (vetoed or already done). Empty if none." },
      },
      required: [
        "slot",
        "location",
        "include_tag_ids",
        "include_mode",
        "exclude_tag_ids",
        "max_price_level",
        "min_price_level",
        "content_ratings",
        "release_year_min",
        "release_year_max",
        "exclude_entity_ids",
      ],
      additionalProperties: false,
    },
  },
  {
    name: "finalize_plan",
    description:
      "Publishes the plan to the group. Pick one option per item by its ref from the latest plan_slot results. 'why' and 'tradeoff' must only use facts from the tool results (percentiles, who pulled it up, shared tags, personal number ones). Call this exactly once per request, after planning every item.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "A short, friendly name for the plan, like 'Friday in Brooklyn'." },
        summary: { type: "string", description: "One or two sentences on how the plan balances the group." },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              slot: { type: "string", enum: [...SLOT_KINDS] },
              ref: { type: "string", description: "The option ref, e.g. 'dinner-1'." },
              why: { type: "string", description: "One or two sentences: why this works for this group, citing names and Qloo evidence." },
              tradeoff: { anyOf: [{ type: "string" }, { type: "null" }], description: "Who gives up the most and what, or null." },
            },
            required: ["slot", "ref", "why", "tradeoff"],
            additionalProperties: false,
          },
        },
        note_for_group: { anyOf: [{ type: "string" }, { type: "null" }], description: "Optional one-line note for the group chat, or null." },
      },
      required: ["title", "summary", "items", "note_for_group"],
      additionalProperties: false,
    },
  },
];

const slotEnum = z.enum(SLOT_KINDS);
const inputs = {
  read_group_taste: z.object({}).passthrough(),
  find_qloo_tags: z.object({ query: z.string().min(1).max(80), slot: slotEnum }),
  plan_slot: z.object({
    slot: slotEnum,
    location: z.string().max(80).nullable().optional(),
    include_tag_ids: z.array(z.string()).max(6).optional().default([]),
    include_mode: z.enum(["all", "any"]).optional().default("all"),
    exclude_tag_ids: z.array(z.string()).max(8).optional().default([]),
    max_price_level: z.number().int().min(1).max(4).nullable().optional(),
    min_price_level: z.number().int().min(1).max(4).nullable().optional(),
    content_ratings: z.array(z.string()).max(12).optional().default([]),
    release_year_min: z.number().int().nullable().optional(),
    release_year_max: z.number().int().nullable().optional(),
    exclude_entity_ids: z.array(z.string()).max(40).optional().default([]),
  }),
  finalize_plan: z.object({
    title: z.string().min(1).max(80),
    summary: z.string().min(1).max(600),
    items: z
      .array(z.object({ slot: slotEnum, ref: z.string(), why: z.string().max(600), tradeoff: z.string().max(400).nullable().optional() }))
      .min(1),
    note_for_group: z.string().max(400).nullable().optional(),
  }),
};

export type ToolName = keyof typeof inputs;

export interface ToolOutcome {
  content: string;
  isError?: boolean;
}

let stepCounter = 0;
function step(ctx: RunContext, label: string, detail?: string) {
  const id = `s${++stepCounter}`;
  ctx.emit({ type: "step", id, label, detail, state: "running" });
  return {
    done: (d?: string) => ctx.emit({ type: "step", id, label, detail: d ?? detail, state: "done" }),
    fail: (d: string) => ctx.emit({ type: "step", id, label, detail: d, state: "error" }),
  };
}

export async function readGroupTaste(ctx: RunContext): Promise<GroupTaste> {
  if (ctx.taste) return ctx.taste;
  const s = step(ctx, "Reading everyone's taste", "Qloo taste analysis on each person's favourites");
  try {
    const taste = await analyzeGroupTaste(ctx.qloo, ctx.group);
    ctx.taste = taste;
    ctx.emit({ type: "taste", taste });
    s.done(taste.shared.length ? `Shared: ${taste.shared.slice(0, 3).map((t) => t.name).join(", ")}` : "No strong shared tags; looking across categories");
    return taste;
  } catch (error) {
    s.fail((error as Error).message);
    throw error;
  }
}

export async function findTags(ctx: RunContext, query: string, slot: SlotKind) {
  const s = step(ctx, `Looking up "${query}" in Qloo's tags`);
  const def = SLOTS[slot];
  try {
    const tags = await ctx.qloo.findTags(query, { take: 8, parentType: def.filterType }, `Tag search: ${query}`);
    const scoped = tags.filter((t) => !t.parents.length || t.parents.includes(def.filterType));
    const list = (scoped.length ? scoped : tags).slice(0, 6).map((t) => ({ id: t.id, name: t.name, type: t.type }));
    s.done(list.length ? list.map((t) => t.name).slice(0, 3).join(", ") : "No matching tags");
    return list;
  } catch (error) {
    s.fail((error as Error).message);
    throw error;
  }
}

export interface PlanSlotArgs {
  slot: SlotKind;
  location?: string | null;
  include_tag_ids?: string[];
  include_mode?: "all" | "any";
  exclude_tag_ids?: string[];
  max_price_level?: number | null;
  min_price_level?: number | null;
  content_ratings?: string[];
  release_year_min?: number | null;
  release_year_max?: number | null;
  exclude_entity_ids?: string[];
}

export async function runPlanSlot(ctx: RunContext, args: PlanSlotArgs): Promise<SlotResult> {
  const label = SLOT_LABELS[args.slot];
  const where = SLOTS[args.slot].needsLocation ? args.location || ctx.location || "New York City" : undefined;
  const s = step(ctx, `Planning ${label.toLowerCase()}`, where ? `Qloo shortlist in ${where}, scored for ${ctx.group.length} people` : `Qloo shortlist scored for ${ctx.group.length} people`);
  try {
    const taste = ctx.taste;
    const result = await planSlot(ctx.qloo, {
      slot: args.slot,
      group: ctx.group,
      location: where,
      includeTagIds: args.include_tag_ids,
      includeMode: args.include_mode,
      excludeTagIds: args.exclude_tag_ids,
      priceMax: args.max_price_level ?? undefined,
      priceMin: args.min_price_level ?? undefined,
      contentRatings: args.content_ratings,
      releaseYearMin: args.release_year_min ?? undefined,
      releaseYearMax: args.release_year_max ?? undefined,
      excludeEntityIds: [...(args.exclude_entity_ids ?? []), ...(ctx.vetoes[args.slot] ?? [])],
      weights: ctx.weights,
      sharedTags: taste?.shared,
    });
    ctx.slotResults[args.slot] = result;
    ctx.freshSlots.add(args.slot);
    ctx.emit({ type: "slot", result });
    const top = result.candidates[0];
    s.done(top ? `${result.poolSize} options scored · best fair pick: ${top.entity.name}` : result.notes[0] ?? "No options found");
    return result;
  } catch (error) {
    s.fail((error as Error).message);
    throw error;
  }
}

export interface FinalizeArgs {
  title: string;
  summary: string;
  items: Array<{ slot: SlotKind; ref: string; why: string; tradeoff?: string | null }>;
  note_for_group?: string | null;
}

/** Validates picks against the scored shortlists and publishes the plan. */
export function finalize(ctx: RunContext, args: FinalizeArgs): { plan?: Plan; errors: string[] } {
  const errors: string[] = [];
  const items: Plan["items"] = [];
  for (const item of args.items) {
    const result = ctx.slotResults[item.slot];
    if (!result) {
      errors.push(`No plan_slot results for ${item.slot} yet. Call plan_slot first.`);
      continue;
    }
    const pick = result.candidates.find((c) => c.ref === item.ref);
    if (!pick) {
      errors.push(`${item.ref} is not one of the ${item.slot} options (${result.candidates.map((c) => c.ref).join(", ")}).`);
      continue;
    }
    items.push({
      slot: item.slot,
      pick,
      alternatives: result.candidates.filter((c) => c.ref !== item.ref).slice(0, 3),
      why: item.why,
      tradeoff: item.tradeoff ?? undefined,
    });
  }
  if (errors.length) return { errors };
  const plan: Plan = {
    title: args.title,
    summary: args.summary,
    items,
    noteForGroup: args.note_for_group ?? undefined,
    weights: ctx.weights,
    createdAt: new Date().toISOString(),
  };
  ctx.plan = plan;
  ctx.emit({ type: "plan", plan });
  return { plan, errors: [] };
}

/** Builds a plan from the top fair option of every planned slot (no model needed). */
export function autoPlan(ctx: RunContext, title?: string): Plan | undefined {
  const items: FinalizeArgs["items"] = [];
  for (const slot of ctx.slots) {
    const r = ctx.slotResults[slot];
    const pick = r?.candidates[0];
    if (!r || !pick) continue;
    items.push({ slot, ref: pick.ref, why: whyText(pick, r, ctx.nameOf), tradeoff: tradeoffText(pick, r, ctx.nameOf) ?? null });
  }
  if (!items.length) return undefined;
  const fairCount = items.filter((i) => ctx.slotResults[i.slot]?.candidates[0]?.fair).length;
  const where = ctx.location ? ` in ${ctx.location}` : "";
  const res = finalize(ctx, {
    title: title ?? `${items.map((i) => SLOT_LABELS[i.slot]).join(" + ")}${where}`,
    summary:
      ctx.group.length > 1
        ? fairCount === items.length
          ? `Every pick clears everyone's misery floor, so no one is stuck with something near the bottom of their list.`
          : `Your tastes are far apart on some of this, so a few picks are compromises. The trade-offs are spelled out below.`
        : `Picked from Qloo's strongest matches for your favourites.`,
    items,
    note_for_group: null,
  });
  return res.plan;
}

export async function executeTool(ctx: RunContext, name: string, rawInput: unknown): Promise<ToolOutcome> {
  if (!(name in inputs)) return { content: JSON.stringify({ error: `Unknown tool ${name}` }), isError: true };
  const parsed = inputs[name as ToolName].safeParse(rawInput ?? {});
  if (!parsed.success) {
    return { content: JSON.stringify({ error: "Invalid input", issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) }), isError: true };
  }
  try {
    switch (name as ToolName) {
      case "read_group_taste":
        return { content: JSON.stringify(compactTaste(await readGroupTaste(ctx), ctx.nameOf)) };
      case "find_qloo_tags": {
        const a = parsed.data as z.infer<typeof inputs.find_qloo_tags>;
        return { content: JSON.stringify({ query: a.query, tags: await findTags(ctx, a.query, a.slot) }) };
      }
      case "plan_slot": {
        const a = parsed.data as z.infer<typeof inputs.plan_slot>;
        const result = await runPlanSlot(ctx, a);
        return { content: JSON.stringify(compactSlot(result, ctx.nameOf)) };
      }
      case "finalize_plan": {
        const a = parsed.data as z.infer<typeof inputs.finalize_plan>;
        const s = step(ctx, "Writing up the plan");
        const { errors } = finalize(ctx, a);
        if (errors.length) {
          s.fail(errors[0]);
          return { content: JSON.stringify({ ok: false, errors }), isError: true };
        }
        s.done(`${a.items.length} item${a.items.length === 1 ? "" : "s"}`);
        return { content: JSON.stringify({ ok: true, published_items: a.items.map((i) => i.ref) }) };
      }
    }
  } catch (error) {
    return { content: JSON.stringify({ error: (error as Error).message }), isError: true };
  }
  return { content: JSON.stringify({ error: "unreachable" }), isError: true };
}
