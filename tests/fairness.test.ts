import { describe, expect, it } from "vitest";
import { attribute, chooseFloor, groupScore, ledgerWeights, rankForGroup, rankWithinPool, satisfaction } from "../server/engine/fairness";

describe("rankWithinPool", () => {
  it("turns raw affinities into percentiles within the shortlist", () => {
    const r = rankWithinPool(["a", "b", "c", "d", "e"], new Map([["a", 0.9], ["b", 0.5], ["c", 0.7], ["d", 0.1], ["e", 0.3]]));
    expect(r.percentile.get("a")).toBe(1);
    expect(r.percentile.get("c")).toBe(0.75);
    expect(r.percentile.get("d")).toBe(0);
    expect(r.rank.get("b")).toBe(3);
  });

  it("is scale-free: only the order of one person's scores matters", () => {
    const ids = ["a", "b", "c"];
    const small = rankWithinPool(ids, new Map([["a", 0.31], ["b", 0.3], ["c", 0.29]]));
    const big = rankWithinPool(ids, new Map([["a", 0.99], ["b", 0.5], ["c", 0.01]]));
    expect([...small.percentile.values()]).toEqual([...big.percentile.values()]);
  });

  it("gives ties the same rank and puts unscored items last", () => {
    const r = rankWithinPool(["a", "b", "c", "d"], new Map<string, number | null>([["a", 0.8], ["b", 0.8], ["c", null]]));
    expect(r.rank.get("a")).toBe(1.5);
    expect(r.rank.get("b")).toBe(1.5);
    expect(r.percentile.get("c")).toBe(0);
    expect(r.percentile.get("d")).toBe(0);
    expect(r.missing).toEqual(["c", "d"]);
  });

  it("handles a one-item shortlist", () => {
    expect(rankWithinPool(["x"], new Map([["x", 0.2]])).percentile.get("x")).toBe(1);
  });
});

describe("groupScore", () => {
  it("is 1 when everyone's top pick is the same", () => {
    expect(groupScore([1, 1, 1], [1, 1, 1])).toBe(1);
  });

  it("punishes one unhappy person more than an average would", () => {
    const balanced = groupScore([0.6, 0.6, 0.6], [1, 1, 1]);
    const lopsided = groupScore([1, 1, 0.05], [1, 1, 1]);
    expect((1 + 1 + 0.05) / 3).toBeGreaterThan(0.6); // the plain mean prefers the lopsided option...
    expect(balanced).toBeGreaterThan(lopsided); // ...the multiplicative score does not
  });

  it("respects weights", () => {
    const favourA = groupScore([0.9, 0.3], [1.5, 0.75]);
    const favourB = groupScore([0.9, 0.3], [0.75, 1.5]);
    expect(favourA).toBeGreaterThan(favourB);
  });
});

describe("chooseFloor and rankForGroup", () => {
  it("picks the highest misery floor that still leaves options", () => {
    expect(chooseFloor([0.9, 0.5, 0.45, 0.1])).toBe(0.4);
    expect(chooseFloor([0.25, 0.22, 0.21, 0.05])).toBe(0.2);
    expect(chooseFloor([0.05, 0.01])).toBe(0);
  });

  it("ranks options above the floor first, even if another has a higher total", () => {
    const items = [
      { id: "crowd-pleaser", percentiles: { a: 1, b: 1, c: 0.1 }, popularity: 0.99 },
      { id: "fair", percentiles: { a: 0.7, b: 0.65, c: 0.6 } },
      { id: "fair-2", percentiles: { a: 0.6, b: 0.5, c: 0.45 } },
      { id: "fair-3", percentiles: { a: 0.45, b: 0.5, c: 0.42 } },
    ];
    const { ranked, floor } = rankForGroup(items, ["a", "b", "c"], { a: 1, b: 1, c: 1 });
    expect(floor).toBe(0.4);
    expect(ranked[0].item.id).toBe("fair");
    expect(ranked.at(-1)!.item.id).toBe("crowd-pleaser");
    expect(ranked.at(-1)!.fair).toBe(false);
  });
});

describe("ledgerWeights", () => {
  it("gives equal weights without history", () => {
    expect(ledgerWeights(["a", "b"])).toEqual({ a: 1, b: 1 });
  });

  it("gives whoever compromised most a bigger say, within bounds", () => {
    const w = ledgerWeights(["a", "b", "c"], { a: [0.9, 0.95], b: [0.85], c: [0.3, 0.4] });
    expect(w.c).toBeGreaterThan(w.a);
    expect(w.c).toBeGreaterThan(w.b);
    expect(Math.max(...Object.values(w))).toBeLessThanOrEqual(1.6);
    const mean = Object.values(w).reduce((s, x) => s + x, 0) / 3;
    expect(mean).toBeCloseTo(1, 1);
  });
});

describe("attribute", () => {
  it("splits Qloo explainability credit between the people who liked each input", () => {
    const owners = new Map([
      ["film", ["a"]],
      ["band", ["b"]],
      ["shared", ["a", "b"]],
    ]);
    const credit = attribute(new Map([["film", 0.6], ["band", 0.2], ["shared", 0.4]]), owners, ["a", "b"]);
    expect(credit.a).toBeCloseTo(0.67, 2);
    expect(credit.b).toBeCloseTo(0.33, 2);
  });

  it("returns nothing when explainability is missing", () => {
    expect(attribute(new Map(), new Map(), ["a"])).toEqual({});
  });
});

describe("satisfaction", () => {
  it("averages each person's percentiles across the plan", () => {
    expect(satisfaction([{ a: 1, b: 0.5 }, { a: 0.5, b: 0.5 }], ["a", "b"])).toEqual({ a: 0.75, b: 0.5 });
  });
});
