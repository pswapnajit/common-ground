// Runs one planning request: the model-driven agent loop when an LLM is
// configured, otherwise (or if the model is unavailable) the rule-based
// planner. Both paths call the same Qloo-backed tools and stream the same events.

import type { AgentHistory, GroupTaste, Person, PlanEvent, PlanRequestBody, SlotKind, SlotResult } from "../../shared/types.js";
import { LOCATED_SLOTS, SLOT_LABELS } from "../../shared/types.js";
import type { AppConfig } from "../config.js";
import { ledgerWeights } from "../engine/fairness.js";
import { qlooFor } from "../qloo/index.js";
import { groupWord, topPhrase } from "./describe.js";
import { SYSTEM_PROMPT, firstMessage, followUpMessage } from "./prompt.js";
import { LlmUnavailableError, providerFor, type LlmProvider, type ToolCall } from "./providers/index.js";
import { SLOT_KINDS, TOOL_SPECS, autoPlan, executeTool, findTags, makeContext, readGroupTaste, runPlanSlot, type PlanSlotArgs, type RunContext } from "./tools.js";

const DEADLINE_MS = 50_000;
const MAX_HISTORY_BYTES = 400_000;

interface Memo {
  groupKey: string;
  taste?: GroupTaste;
  slotResults: Partial<Record<SlotKind, SlotResult>>;
  /** Follow-up messages so far, so the rule-based planner keeps earlier constraints. */
  messages: string[];
}

function groupKey(group: Person[]): string {
  return group.map((p) => `${p.id}:${p.likes.map((l) => l.id).sort().join(",")}`).join("|");
}

/** Trims and de-duplicates the request so nothing oversized reaches Qloo or the model. */
export function sanitize(body: PlanRequestBody): PlanRequestBody {
  const seenNames = new Map<string, number>();
  const group = (Array.isArray(body.group) ? body.group : []).slice(0, 6).map((p, i) => {
    let name = String(p?.name ?? "").trim().slice(0, 24) || `Person ${i + 1}`;
    const n = (seenNames.get(name.toLowerCase()) ?? 0) + 1;
    seenNames.set(name.toLowerCase(), n);
    if (n > 1) name = `${name} ${n}`;
    const likes = (Array.isArray(p?.likes) ? p.likes : [])
      .filter((l) => l && typeof l.id === "string" && l.id.length < 80 && typeof l.name === "string")
      .slice(0, 12)
      .map((l) => ({ id: l.id, name: l.name.slice(0, 80), kind: l.kind, subtitle: l.subtitle?.slice(0, 60) }));
    return { id: String(p?.id ?? `p${i}`).slice(0, 40), name, color: Number(p?.color ?? i) || 0, likes };
  });
  const slots = [...new Set((Array.isArray(body.slots) ? body.slots : []).filter((s): s is SlotKind => (SLOT_KINDS as readonly string[]).includes(s)))].slice(0, 4);
  return {
    group,
    slots: slots.length ? slots : ["dinner"],
    location: body.location?.toString().slice(0, 80),
    notes: body.notes?.toString().slice(0, 600),
    message: body.message?.toString().slice(0, 600),
    history: body.history,
    vetoes: body.vetoes,
    ledger: body.ledger,
  };
}

// ---- Rule-based constraint reading (used without a model) -----------------

interface Constraint {
  slots: SlotKind[];
  query?: string;
  mode: "include" | "exclude" | "price_max" | "price_min" | "ratings";
  value?: number | string[];
}

const RULES: Array<{ test: RegExp; c: Constraint }> = [
  { test: /\b(vegetarian|vegan|veggie|plant[- ]based)\b/i, c: { slots: ["dinner"], query: "vegetarian", mode: "include" } },
  { test: /\brooftop\b/i, c: { slots: ["drinks", "dinner"], query: "rooftop", mode: "include" } },
  { test: /\b(outdoor|patio|outside)\b/i, c: { slots: ["dinner", "drinks"], query: "outdoor seating", mode: "include" } },
  { test: /\blive music\b/i, c: { slots: ["drinks", "dinner"], query: "live music", mode: "include" } },
  { test: /\b(cheap|cheaper|budget|affordable|inexpensive|(not|nothing|nowhere) too (pricey|expensive|fancy))\b/i, c: { slots: ["dinner", "drinks"], mode: "price_max", value: 2 } },
  { test: /\b(fancy|splurge|upscale|special occasion|treat ourselves)\b/i, c: { slots: ["dinner", "drinks"], mode: "price_min", value: 3 } },
  { test: /\b(no|not|nothing|without|hate[sd]?)\b[^.]{0,20}\b(horror|scary|spooky)\b/i, c: { slots: ["movie", "series"], query: "horror", mode: "exclude" } },
  { test: /\b(kids?|children|family[- ]friendly|all ages)\b/i, c: { slots: ["movie"], mode: "ratings", value: ["G", "PG"] } },
];

async function constraintArgs(ctx: RunContext, text: string, applied: string[] = []): Promise<Partial<Record<SlotKind, Partial<PlanSlotArgs>>>> {
  const out: Partial<Record<SlotKind, Partial<PlanSlotArgs>>> = {};
  const get = (s: SlotKind) => (out[s] ??= { include_tag_ids: [], exclude_tag_ids: [] });
  for (const { test, c } of RULES) {
    if (!test.test(text)) continue;
    const slots = c.slots.filter((s) => ctx.slots.includes(s));
    if (!slots.length) continue;
    if (c.mode === "price_max" || c.mode === "price_min") {
      for (const s of slots) get(s)[c.mode === "price_max" ? "max_price_level" : "min_price_level"] = c.value as number;
      applied.push(c.mode === "price_max" ? `price up to ${"$".repeat(c.value as number)}` : `price from ${"$".repeat(c.value as number)}`);
      continue;
    }
    if (c.mode === "ratings") {
      for (const s of slots) get(s).content_ratings = c.value as string[];
      applied.push(`ratings ${(c.value as string[]).join("/")}`);
      continue;
    }
    const found = await Promise.all(slots.map((s) => findTags(ctx, c.query!, s).catch(() => [])));
    slots.forEach((s, i) => {
      const word = c.query!.split(" ")[0].slice(0, 5).toLowerCase();
      const tag = found[i].find((t) => t.name.toLowerCase().includes(word));
      if (!tag) return;
      const args = get(s);
      (c.mode === "include" ? args.include_tag_ids! : args.exclude_tag_ids!).push(tag.id);
      const label = `${c.mode === "include" ? "only" : "no"} "${tag.name}"`;
      if (!applied.includes(label)) applied.push(label);
    });
  }
  return out;
}

async function runRuleBased(ctx: RunContext, constraintText: string, followUp?: string) {
  const applied: string[] = [];
  // Taste analysis and tag lookups don't depend on each other.
  const [, extra] = await Promise.all([readGroupTaste(ctx).catch(() => undefined), constraintArgs(ctx, constraintText, applied)]);
  await Promise.all(
    ctx.slots.map((slot) =>
      runPlanSlot(ctx, { slot, location: ctx.location ?? null, ...extra[slot] }).catch((error) =>
        ctx.emit({ type: "error", message: `${SLOT_LABELS[slot]}: ${(error as Error).message}` }),
      ),
    ),
  );
  const plan = autoPlan(ctx);
  if (plan) {
    const people = ctx.group.filter((p) => p.likes.length);
    const lows = people
      .map((p) => ({ p, worst: Math.min(...plan.items.map((i) => i.pick.percentiles[p.id] ?? 0)) }))
      .sort((a, b) => a.worst - b.worst);
    const filters = applied.length ? ` Qloo filters in use: ${applied.join(", ")}.` : "";
    const fairness =
      people.length > 1 ? ` The pick that asks the most of anyone is in ${lows[0].p.name}'s ${topPhrase(lows[0].worst)}.` : "";
    const text = followUp
      ? applied.length
        ? `Re-planned.${filters}${fairness}`
        : `I re-planned, but I couldn't turn "${followUp.slice(0, 80)}" into a Qloo filter (I understand things like cheaper, vegetarian, rooftop, outdoor, live music, no horror, kid-friendly).${fairness}`
      : people.length > 1
        ? `Here's a plan built from Qloo's scores for ${groupWord(people.length)}.${fairness}${filters} Tell me what to change, like "cheaper" or "no horror".`
        : `Here's a plan from Qloo's strongest matches for your favourites.${filters}`;
    ctx.emit({ type: "message", text });
  } else {
    ctx.emit({ type: "message", text: "I couldn't find options with those settings. Try a broader location or fewer filters." });
  }
}

// ---- Model-driven loop ------------------------------------------------------

const ORDER: Record<string, number> = { read_group_taste: 0, find_qloo_tags: 0, plan_slot: 1, finalize_plan: 2 };

async function executeAll(ctx: RunContext, calls: ToolCall[]) {
  const results = new Map<string, { id: string; content: string; isError?: boolean }>();
  // Taste and tag lookups first, then item planning, then the write-up: a model
  // may ask for all of them in one turn, but later stages read earlier results.
  for (const stage of [0, 1, 2]) {
    const batch = calls.filter((c) => (ORDER[c.name] ?? 1) === stage);
    const outs = await Promise.all(batch.map((c) => executeTool(ctx, c.name, c.input)));
    batch.forEach((c, i) => results.set(c.id, { id: c.id, ...outs[i] }));
  }
  return calls.map((c) => results.get(c.id)!);
}

export interface RunDeps {
  /** Overrides the configured model provider (tests use a scripted one). Pass null to force the rule-based planner. */
  provider?: LlmProvider | null;
}

export async function runPlan(rawBody: PlanRequestBody, config: AppConfig, emit: (e: PlanEvent) => void, deps: RunDeps = {}): Promise<void> {
  const req = sanitize(rawBody);
  const qloo = qlooFor(config, (receipt) => emit({ type: "qloo", receipt }));
  const provider = deps.provider === undefined ? providerFor(config) : deps.provider ?? undefined;
  const personIds = req.group.filter((p) => p.likes.length).map((p) => p.id);
  const weights = ledgerWeights(personIds, req.ledger);
  const located = req.slots.some((s) => LOCATED_SLOTS.includes(s));

  // Restore state from the previous run if the group is unchanged.
  const prior = (req.history?.memo ?? undefined) as Memo | undefined;
  const key = groupKey(req.group);
  const sameGroup = prior?.groupKey === key;
  const ctx = makeContext({
    qloo,
    group: req.group,
    slots: req.slots,
    location: located ? req.location?.trim() || "New York City" : undefined,
    weights,
    vetoes: req.vetoes ?? {},
    emit,
    taste: sameGroup ? prior?.taste : undefined,
    // Only a model-driven follow-up can reuse earlier shortlists (it re-plans what changed).
    slotResults: provider && sameGroup && req.message ? { ...(prior?.slotResults ?? {}) } : {},
  });
  const followUps = [...(sameGroup ? (prior?.messages ?? []) : []), ...(req.message ? [req.message] : [])].slice(-8);
  const constraintText = [req.notes, ...followUps].filter(Boolean).join(". ");

  emit({
    type: "status",
    status: {
      qloo: qloo.mode,
      llm: provider ? provider.name : "rule-based",
      model: provider?.model,
      notice: qloo.mode === "mock" ? "Demo data: Qloo key not configured, so results come from a small synthetic catalogue." : undefined,
    },
  });

  if (!personIds.length) {
    emit({ type: "message", text: "Add at least one favourite for someone in the group, then I can plan." });
    emit({ type: "done" });
    return;
  }

  let usedModel = false;
  let history: AgentHistory | undefined;
  if (provider) {
    const priorMessages =
      req.message && req.history?.provider === provider.name && req.history?.model === provider.model && Array.isArray(req.history.messages) &&
      JSON.stringify(req.history.messages).length < MAX_HISTORY_BYTES
        ? req.history.messages
        : undefined;
    const session = provider.session(SYSTEM_PROMPT, TOOL_SPECS, priorMessages);
    session.addUser(priorMessages ? followUpMessage(req, req.slots) : firstMessage({ ...req, notes: [req.notes, req.message].filter(Boolean).join(". ") }, req.slots, weights, ctx.nameOf));
    const started = Date.now();
    try {
      for (let stepNo = 0; stepNo < config.llm.maxSteps; stepNo++) {
        if (Date.now() - started > DEADLINE_MS) break;
        const turn = await session.turn();
        for (const t of turn.thinking) emit({ type: "thinking", text: t.slice(0, 600) });
        if (turn.stop === "refusal") {
          emit({ type: "error", message: "The model declined this request, so the built-in planner took over." });
          break;
        }
        if (turn.toolCalls.length) {
          session.addToolResults(await executeAll(ctx, turn.toolCalls));
          continue;
        }
        if (turn.text) emit({ type: "message", text: turn.text });
        usedModel = true;
        break;
      }
      history = { provider: provider.name, model: provider.model, messages: session.messages };
    } catch (error) {
      const message = error instanceof LlmUnavailableError ? error.message : `Agent error: ${(error as Error).message}`;
      emit({ type: "status", status: { qloo: qloo.mode, llm: "rule-based", notice: `${message} Using the built-in planner instead.` } });
    }
  }

  if (!ctx.plan) {
    // The model stopped before publishing. If every item was planned in this
    // run, publish the fairest options; otherwise plan everything again.
    if (req.slots.every((s) => ctx.freshSlots.has(s) && ctx.slotResults[s])) {
      autoPlan(ctx);
      if (provider && !usedModel) emit({ type: "message", text: "Here's the plan, built from the fairest option for each item." });
    } else {
      ctx.slotResults = {};
      await runRuleBased(ctx, constraintText, req.message);
    }
  }

  const memo: Memo = { groupKey: key, taste: ctx.taste, slotResults: ctx.slotResults, messages: followUps };
  emit({ type: "history", history: { provider: history?.provider ?? "rule-based", model: history?.model ?? "rule-based", messages: history?.messages ?? [], memo } });
  emit({ type: "done" });
}
