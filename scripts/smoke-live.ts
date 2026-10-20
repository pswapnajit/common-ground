// Live check against the Qloo hackathon API: every endpoint the app uses, then
// a full plan. Prints shapes and a few names to the console only; nothing is
// written to disk (the developer guide says not to store Qloo data in a repo).
//
//   npm run smoke:live

import { existsSync, readFileSync } from "node:fs";
import { loadConfig } from "../server/config";
import { qlooFor } from "../server/qloo/index";
import { planSlot } from "../server/engine/planner";
import { analyzeGroupTaste } from "../server/engine/taste";
import { resolveCategoryTag, SLOTS } from "../server/engine/slots";
import type { Person } from "../shared/types";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}
const config = loadConfig();
if (config.qloo.mode !== "live") {
  console.error("QLOO_API_KEY is not set in .env, so there is nothing live to test.");
  process.exit(1);
}
const qloo = qlooFor(config);
const keys = (o: unknown) => (o && typeof o === "object" ? Object.keys(o as object).join(",") : String(o));
let failures = 0;
async function check(name: string, fn: () => Promise<string>) {
  const t = Date.now();
  try {
    console.log(`ok   ${name} (${Date.now() - t}ms): ${await fn()}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${name}: ${(error as Error).message}`);
  }
}

const find = async (q: string, type: string) => (await qloo.search(q, { types: [type], take: 3 }))[0];

await check("search", async () => {
  const r = await qloo.search("Hereditary", { types: ["urn:entity:movie"], take: 3 });
  return `${r.length} results; first: ${r[0]?.name} (${r[0]?.kind}, ${r[0]?.subtitle})`;
});

await check("tags search", async () => {
  const r = await qloo.findTags("restaurant", { take: 8, parentType: "urn:entity:place" });
  return r.slice(0, 5).map((t) => `${t.id} [${t.parents.join("|")}]`).join("; ");
});

for (const slot of ["dinner", "drinks"] as const) {
  await check(`category tag for ${slot}`, async () => String(await resolveCategoryTag(qloo, SLOTS[slot])));
}

const people: Person[] = [
  { id: "a", name: "A", color: 0, likes: [await find("Fleabag", "urn:entity:tv_show"), await find("Phoebe Bridgers", "urn:entity:artist")].filter(Boolean) },
  { id: "b", name: "B", color: 1, likes: [await find("Hereditary", "urn:entity:movie"), await find("Metallica", "urn:entity:artist")].filter(Boolean) },
  { id: "c", name: "C", color: 2, likes: [await find("Taylor Swift", "urn:entity:artist"), await find("Notting Hill", "urn:entity:movie")].filter(Boolean) },
];
const allLikes = people.flatMap((p) => p.likes.map((l) => l.id));
console.log(`     resolved likes: ${people.map((p) => p.likes.map((l) => l.name).join(" + ")).join(" | ")}`);

let shortlist: string[] = [];
await check("insights + explainability", async () => {
  const r = await qloo.insights({ "filter.type": "urn:entity:movie", "signal.interests.entities": allLikes, "feature.explainability": true, take: 10 });
  shortlist = r.entities.map((e) => e.id);
  const raw = (r.raw as any)?.results?.entities?.[0];
  return `${r.entities.length} movies; first ${r.entities[0]?.name} affinity=${r.entities[0]?.affinity}; query keys: ${keys(raw?.query)}; explainability keys: ${keys(raw?.query?.explainability)}; parsed contributors: ${r.entities[0]?.explain.size}; top-level query keys: ${keys((r.raw as any)?.query)}`;
});

await check("score a fixed shortlist (filter.results.entities)", async () => {
  const r = await qloo.insights({ "filter.type": "urn:entity:movie", "signal.interests.entities": people[1].likes.map((l) => l.id), "filter.results.entities": shortlist, take: shortlist.length });
  return `asked ${shortlist.length}, got ${r.entities.length}, with affinity: ${r.entities.filter((e) => typeof e.affinity === "number").length}`;
});

await check("taste analysis (urn:tag)", async () => {
  const r = await qloo.insights({ "filter.type": "urn:tag", "signal.interests.entities": people[0].likes.map((l) => l.id), "diversify.by": "subtype", "diversify.take": 6, take: 20 });
  return r.tags.slice(0, 8).map((t) => `${t.name} <${t.type}> ${t.affinity?.toFixed?.(3)}`).join("; ");
});

await check("compare", async () => {
  const r = await qloo.compare(people[0].likes.map((l) => l.id), people[2].likes.map((l) => l.id), { take: 6 });
  return r.map((t) => `${t.name} ${t.affinity}`).join("; ");
});

await check("places in New York City", async () => {
  const tag = await resolveCategoryTag(qloo, SLOTS.dinner);
  const r = await qloo.insights({ "filter.type": "urn:entity:place", "filter.tags": tag ? [tag] : undefined, "filter.location.query": "New York City", "signal.interests.entities": allLikes, take: 5 });
  const raw = (r.raw as any)?.results?.entities?.[0];
  return `${r.entities.length}: ${r.entities.map((e) => `${e.name} [${e.subtitle}]`).join("; ")}; property keys: ${keys(raw?.properties)}; geocode keys: ${keys(raw?.properties?.geocode)}`;
});

await check("destinations", async () => {
  try {
    const r = await qloo.insights({ "filter.type": "urn:entity:destination", "signal.interests.entities": allLikes, take: 5 });
    return `destination ok: ${r.entities.map((e) => e.name).join(", ")}`;
  } catch (error) {
    const r = await qloo.insights({ "filter.type": "urn:entity:locality", "signal.interests.entities": allLikes, take: 5 });
    return `destination failed (${(error as Error).message.slice(0, 60)}); locality ok: ${r.entities.map((e) => e.name).join(", ")}`;
  }
});

await check("group taste", async () => {
  const t = await analyzeGroupTaste(qloo, people);
  return `shared: ${t.shared.map((x) => x.name).join(", ") || "none"}; tensions: ${t.tensions.map((x) => x.name).join(", ")}`;
});

for (const slot of ["dinner", "movie", "music", "trip"] as const) {
  await check(`planSlot ${slot}`, async () => {
    const r = await planSlot(qloo, { slot, group: people, location: "Brooklyn" });
    const c = r.candidates[0];
    return `pool ${r.poolSize}, floor ${r.floor}; pick ${c?.entity.name} (${c?.entity.subtitle}) pct ${JSON.stringify(c?.percentiles)} credit ${JSON.stringify(c?.attribution)}; notes: ${r.notes.join(" ") || "-"}`;
  });
}

console.log(`\n${qloo.receipts.length} Qloo requests, ${failures} failed checks.`);
process.exit(failures ? 1 : 0);
