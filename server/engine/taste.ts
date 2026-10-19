// Group taste fingerprint: what each person's favourites say about them, what
// the group shares, and where they pull in different directions. Uses Qloo's
// taste analysis (filter.type=urn:tag), then scores every person against the
// union of everyone's top tags (filter.results.tags) so they can be compared.

import type { GroupTaste, Person, TasteTag } from "../../shared/types.js";
import type { Qloo } from "../qloo/client.js";
import { isReadableTag } from "../qloo/normalize.js";
import { rankWithinPool } from "./fairness.js";

const TOP_PER_PERSON = 10;

function likeIds(p: Person): string[] {
  return [...new Set(p.likes.map((l) => l.id))];
}

export async function analyzeGroupTaste(qloo: Qloo, group: Person[]): Promise<GroupTaste> {
  const people = group.filter((p) => p.likes.length > 0);
  if (!people.length) return { people: [], shared: [], tensions: [] };

  // 1. Each person's own top tags.
  const own = await Promise.all(
    people.map((p) =>
      qloo
        .insights(
          {
            "filter.type": "urn:tag",
            "signal.interests.entities": likeIds(p),
            "diversify.by": "subtype",
            "diversify.take": 6,
            take: 30,
          },
          `Taste fingerprint · ${p.name}`,
        )
        .then((r) => r.tags.filter((t) => isReadableTag(t)))
        .catch(() => []),
    ),
  );

  const names = new Map<string, { name: string; type?: string }>();
  const union: string[] = [];
  own.forEach((tags) => {
    const seenNames = new Set<string>();
    for (const t of tags) {
      const key = t.name.toLowerCase();
      if (seenNames.has(key)) continue;
      seenNames.add(key);
      if (seenNames.size > TOP_PER_PERSON) break;
      if (!names.has(t.id)) {
        names.set(t.id, { name: t.name, type: t.type });
        union.push(t.id);
      }
    }
  });

  // 2. Everyone scored on the same tag list, so the numbers line up.
  const scored = await Promise.all(
    people.map((p, i) =>
      union.length
        ? qloo
            .insights(
              {
                "filter.type": "urn:tag",
                "signal.interests.entities": likeIds(p),
                "filter.results.tags": union,
                take: Math.min(union.length, 50),
              },
              `Shared-tag scores · ${p.name}`,
            )
            .then((r) => new Map(r.tags.map((t) => [t.id, t.affinity ?? null])))
            .catch(() => new Map(own[i].map((t) => [t.id, t.affinity ?? null])))
        : Promise.resolve(new Map<string, number | null>()),
    ),
  );

  const byPerson = people.map((p, i) => rankWithinPool(union, scored[i] as Map<string, number | null>));
  const tags: TasteTag[] = union.map((id) => ({
    id,
    name: names.get(id)!.name,
    type: names.get(id)!.type,
    byPerson: Object.fromEntries(people.map((p, i) => [p.id, byPerson[i].percentile.get(id) ?? 0])),
  }));

  const minOf = (t: TasteTag) => Math.min(...people.map((p) => t.byPerson[p.id] ?? 0));
  const maxOf = (t: TasteTag) => Math.max(...people.map((p) => t.byPerson[p.id] ?? 0));
  const meanOf = (t: TasteTag) => people.reduce((s, p) => s + (t.byPerson[p.id] ?? 0), 0) / people.length;

  const shared =
    people.length === 1
      ? []
      : tags
          .filter((t) => minOf(t) >= 0.45)
          .sort((a, b) => minOf(b) - minOf(a) || meanOf(b) - meanOf(a))
          .slice(0, 8);
  const sharedIds = new Set(shared.map((t) => t.id));
  const tensions =
    people.length === 1
      ? []
      : tags
          .filter((t) => !sharedIds.has(t.id) && maxOf(t) >= 0.75 && minOf(t) <= 0.3)
          .sort((a, b) => maxOf(b) - minOf(b) - (maxOf(a) - minOf(a)))
          .slice(0, 6)
          .map((t) => {
            const champion = people.reduce((best, p) => ((t.byPerson[p.id] ?? 0) > (t.byPerson[best.id] ?? 0) ? p : best), people[0]);
            return { ...t, champion: champion.id };
          });

  const result: GroupTaste = {
    people: people.map((p, i) => ({
      personId: p.id,
      topTags: own[i].slice(0, 6).map((t) => ({ id: t.id, name: t.name, score: t.affinity ?? 0 })),
    })),
    shared,
    tensions,
  };

  // Two people: also ask Qloo's compare endpoint directly.
  if (people.length === 2) {
    try {
      const pair = await qloo.compare(likeIds(people[0]), likeIds(people[1]), { take: 10 }, `Compare ${people[0].name} and ${people[1].name}`);
      result.pairShared = pair.filter(isReadableTag).slice(0, 8).map((t) => ({ id: t.id, name: t.name, score: t.affinity ?? 0 }));
    } catch {
      // optional extra; the matrix above already covers the overlap
    }
  }
  return result;
}
