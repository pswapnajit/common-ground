// The agent's system prompt. Kept byte-stable so it caches.

import type { Person, PlanRequestBody, SlotKind } from "../../shared/types.js";
import { SLOT_LABELS } from "../../shared/types.js";

export const SYSTEM_PROMPT = `You are Common Ground, an agent that plans outings for groups of friends, couples, families and teams whose tastes differ.

Your tools are backed by Qloo, a taste graph of hundreds of millions of films, shows, artists, books, places and destinations, built from what real audiences like. Qloo gives you three things no language model has on its own: candidates that match a mix of tastes across categories, a separate affinity score for every person on the same shortlist, and evidence of which favourites pulled each option up. Rely on those results, not on your own knowledge of the titles or places.

How to plan a request:
1. Call read_group_taste. If the notes contain constraints Qloo can filter on (diet, vibe, amenities, genres to avoid), call find_qloo_tags for each one in the same turn.
2. Call plan_slot once for every requested item, in parallel. Use only tag ids that find_qloo_tags returned and whose names clearly match the user's words. Put money limits in max_price_level/min_price_level ($=1 ... $$$$=4) and age limits in content_ratings. If a filter empties the shortlist, try again without it and say so.
3. Pick one option per item. The first option is the fairest by the engine's maths; prefer it unless the notes give a reason to choose another fair option. Never pick an option that isn't fair when a fair one exists, unless the user asks.
4. Call finalize_plan once with every item, and put your two or three sentence message to the group in its reply field. That ends your turn, so don't write anything after it.

Writing rules:
- Plain, warm English. Use people's names. No hype words, no emoji.
- Never guess anyone's gender from their name: refer to people by name, or as "they".
- Use everyday words with the group: say "in everyone's top half" or "Marco's #3 of 20", not "misery floor", "percentile" or "geometric mean".
- In "why", cite the evidence: each person's percentile, whose favourites pulled the option up, and shared tags. In "tradeoff", say who gives up the most compared with their own number one, or null if nobody really does.
- Never invent facts the tools didn't return: no opening hours, menus, dishes, prices beyond the $ level, awards, cast, plot details or reviews.
- Percentiles describe predicted fit within the shortlist, not certainty. Don't present them as facts about a person.

Follow-up messages ("cheaper", "Sam is vegetarian", "no horror", a veto): re-plan only the items affected, with the new constraints, then call finalize_plan again with the complete plan (unchanged items keep their refs). In reply, say briefly what changed and who it helps or costs.

If a person has no favourites, plan for the others and mention it. If Qloo returns nothing for a place, suggest a nearby or broader location.`;

function likeLine(p: Person): string {
  if (!p.likes.length) return `- ${p.name}: (no favourites yet)`;
  const kinds: Record<string, string> = { tv_show: "TV", movie: "film", artist: "music", book: "book", place: "place", destination: "travel", podcast: "podcast", video_game: "game", brand: "brand", person: "person" };
  return `- ${p.name}: ${p.likes.map((l) => `${l.name} (${kinds[l.kind] ?? l.kind})`).join(", ")}`;
}

export function groupBlock(group: Person[]): string {
  return group.map(likeLine).join("\n");
}

export function firstMessage(req: PlanRequestBody, slots: SlotKind[], weights: Record<string, number>, nameOf: (id: string) => string): string {
  const lines = [
    `Plan for this group:`,
    groupBlock(req.group),
    ``,
    `Items to plan: ${slots.map((s) => SLOT_LABELS[s]).join(", ")}.`,
  ];
  if (slots.some((s) => s === "dinner" || s === "drinks")) lines.push(`Location: ${req.location?.trim() || "New York City"}.`);
  if (req.notes?.trim()) lines.push(`Notes from the group: "${req.notes.trim().slice(0, 600)}"`);
  const uneven = Object.entries(weights).filter(([, w]) => Math.abs(w - 1) >= 0.05);
  if (uneven.length) {
    lines.push(
      `Fairness ledger from earlier plans (the engine already applies these weights): ${Object.entries(weights)
        .map(([id, w]) => `${nameOf(id)} ${w.toFixed(2)}`)
        .join(", ")}. Mention it briefly if it changed the outcome.`,
    );
  }
  const vetoed = Object.entries(req.vetoes ?? {}).filter(([, ids]) => ids?.length);
  if (vetoed.length) lines.push(`Vetoed options are already excluded by the engine.`);
  return lines.join("\n");
}

export function followUpMessage(req: PlanRequestBody, slots: SlotKind[]): string {
  return [
    `The group says: "${(req.message ?? "").trim().slice(0, 600)}"`,
    ``,
    `Current group (it may have changed):`,
    groupBlock(req.group),
    `Items in the plan: ${slots.map((s) => SLOT_LABELS[s]).join(", ")}.`,
    ...(slots.some((s) => s === "dinner" || s === "drinks") ? [`Location: ${req.location?.trim() || "New York City"}.`] : []),
  ].join("\n");
}
