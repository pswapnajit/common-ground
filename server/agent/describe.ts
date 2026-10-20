// Plain-English descriptions built only from Qloo results. Used for the
// agent's tool results (compact JSON), and by the rule-based planner when no
// language model is configured.

import type { EntityCard, GroupTaste, Person, ScoredCandidate, SlotKind, SlotResult } from "../../shared/types.js";
import { SLOT_LABELS } from "../../shared/types.js";

export type NameOf = (personId: string) => string;

export function nameLookup(group: Person[]): NameOf {
  const map = new Map(group.map((p) => [p.id, p.name]));
  return (id) => map.get(id) ?? id;
}

/** "top 10%" style phrase for a percentile. */
export function pctPhrase(p: number): string {
  if (p >= 0.995) return "their #1";
  const top = Math.max(1, Math.round((1 - p) * 100));
  return `top ${top}%`;
}

export function about(e: EntityCard): string {
  const bits: string[] = [];
  const tag = e.tags?.find((t) => !/style:qloo|category:place/.test(t.type ?? ""))?.name;
  if (e.kind === "place") {
    if (tag) bits.push(tag);
    if (e.neighborhood) bits.push(e.neighborhood);
    if (e.priceLevel) bits.push("$".repeat(e.priceLevel));
  } else {
    if (e.subtitle) bits.push(e.subtitle);
    if (tag) bits.push(tag);
  }
  return bits.join(" · ");
}

export function compactCandidate(c: ScoredCandidate, poolSize: number, nameOf: NameOf) {
  return {
    ref: c.ref,
    name: c.entity.name,
    about: about(c.entity),
    fair: c.fair,
    group_score: c.groupScore,
    lowest_percentile: c.minPercentile,
    by_person: Object.fromEntries(
      Object.entries(c.percentiles).map(([pid, p]) => [nameOf(pid), `${pctPhrase(p)} (#${Math.round(c.ranks[pid])} of ${poolSize})`]),
    ),
    credit: Object.fromEntries(Object.entries(c.attribution).map(([pid, a]) => [nameOf(pid), a])),
    pulled_up_by: c.drivers.map((d) => `${nameOf(d.personId)}: ${d.entityName}`),
    shared_tags: c.matchedTags.map((t) => t.name),
    qloo_tags: (c.entity.tags ?? []).slice(0, 5).map((t) => t.name),
  };
}

export function compactSlot(r: SlotResult, nameOf: NameOf) {
  return {
    slot: r.slot,
    where: r.location,
    shortlist_size: r.poolSize,
    misery_floor: r.floor,
    options: r.candidates.map((c) => compactCandidate(c, r.poolSize, nameOf)),
    most_popular_option: r.popularBaseline
      ? {
          name: r.popularBaseline.entity.name,
          by_person: Object.fromEntries(Object.entries(r.popularBaseline.percentiles).map(([pid, p]) => [nameOf(pid), pctPhrase(p)])),
        }
      : undefined,
    personal_number_one: Object.fromEntries(Object.entries(r.personalTop).map(([pid, t]) => [nameOf(pid), t.name])),
    notes: r.notes,
  };
}

export function compactTaste(t: GroupTaste, nameOf: NameOf) {
  return {
    people: t.people.map((p) => ({ name: nameOf(p.personId), top_tags: p.topTags.map((x) => x.name) })),
    shared_tags: t.shared.map((x) => ({
      tag: x.name,
      by_person: Object.fromEntries(Object.entries(x.byPerson).map(([pid, s]) => [nameOf(pid), Math.round(s * 100) / 100])),
    })),
    tension_tags: t.tensions.map((x) => ({ tag: x.name, mostly: nameOf(x.champion) })),
    ...(t.pairShared?.length ? { qloo_compare_shared: t.pairShared.map((x) => x.name) } : {}),
  };
}

/** "top 20%", "top half", "#1" for a percentile. */
export function topPhrase(p: number): string {
  if (p >= 0.995) return "#1";
  const top = Math.max(1, Math.round((1 - p) * 100));
  return top === 50 ? "top half" : `top ${top}%`;
}

/** One or two sentences on why a pick works, from Qloo facts only. */
export function whyText(c: ScoredCandidate, r: SlotResult, nameOf: NameOf): string {
  const people = Object.keys(c.percentiles);
  const parts: string[] = [];
  if (people.length > 1) {
    parts.push(
      c.fair
        ? `It ranks in the ${topPhrase(c.minPercentile)} or better for every one of you, out of ${r.poolSize} options Qloo scored for this group.`
        : `It's the best compromise Qloo found: ${people.map((p) => `${nameOf(p)} ${topPhrase(c.percentiles[p])}`).join(", ")}.`,
    );
  } else {
    parts.push(`It's in your ${topPhrase(c.percentiles[people[0]] ?? 0)} of ${r.poolSize} options Qloo scored.`);
  }
  const [first, second] = c.drivers;
  if (first && second && second.personId !== first.personId) {
    parts.push(`Qloo ties it most to ${nameOf(first.personId)}'s love of ${first.entityName} and ${nameOf(second.personId)}'s ${second.entityName}.`);
  } else if (first) {
    parts.push(`Qloo ties it most to ${nameOf(first.personId)}'s love of ${first.entityName}.`);
  }
  if (c.matchedTags.length) {
    const names = c.matchedTags.map((t) => t.name).slice(0, 3);
    parts.push(`It also carries ${names.length === 1 ? "a tag" : "tags"} you share: ${names.join(", ")}.`);
  }
  return parts.join(" ");
}

export function tradeoffText(c: ScoredCandidate, r: SlotResult, nameOf: NameOf): string | undefined {
  const losers = Object.entries(c.percentiles)
    .filter(([pid]) => r.personalTop[pid] && r.personalTop[pid].entityId !== c.entity.id)
    .sort((a, b) => a[1] - b[1]);
  if (!losers.length) return undefined;
  const [pid, p] = losers[0];
  return `${nameOf(pid)} gives up the most: their own #1 here was ${r.personalTop[pid].name}, and this one is in their ${topPhrase(p)}.`;
}

export function slotLabel(slot: SlotKind): string {
  return SLOT_LABELS[slot];
}
