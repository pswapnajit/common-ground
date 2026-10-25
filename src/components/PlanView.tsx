import { useState } from "react";
import type { GroupTaste, Person, Plan, PlanItem, ScoredCandidate, SlotResult } from "../../shared/types";
import { SLOT_LABELS } from "../../shared/types";
import { Icon, KindIcon, SlotIcon } from "../icons";
import { colorOf } from "../store";
import { Avatar } from "./GroupPanel";

export function pct(p: number): string {
  if (p >= 0.995) return "#1";
  const top = Math.max(1, Math.round((1 - p) * 100));
  return top === 50 ? "Top half" : `Top ${top}%`;
}

function FitBars({ c, people, compact }: { c: ScoredCandidate; people: Person[]; compact?: boolean }) {
  return (
    <div className={`fit${compact ? " compact" : ""}`}>
      {people
        .filter((p) => c.percentiles[p.id] !== undefined)
        .map((p) => {
          const v = c.percentiles[p.id];
          return (
            <div key={p.id} className="fit-row" title={`${p.name}: ${pct(v)} of the shortlist`}>
              {!compact && <Avatar person={p} size={20} />}
              <span className="fit-name">{p.name}</span>
              <span className="track">
                <span className="bar" style={{ width: `${Math.max(3, v * 100)}%`, background: colorOf(p.color) }} />
              </span>
              <span className="fit-val">{pct(v)}</span>
            </div>
          );
        })}
    </div>
  );
}

function Credit({ c, people }: { c: ScoredCandidate; people: Person[] }) {
  const parts = people.map((p) => ({ p, v: c.attribution[p.id] ?? 0 })).filter((x) => x.v > 0.01);
  if (!parts.length) return null;
  const values = parts.map((x) => x.v);
  if (parts.length === people.length && Math.max(...values) - Math.min(...values) < 0.12) {
    return <p className="footnote">Everyone's favourites contributed about equally to this pick.</p>;
  }
  return (
    <>
      <div className="credit-bar" aria-hidden>
        {parts.map(({ p, v }) => (
          <span key={p.id} style={{ width: `${v * 100}%`, background: colorOf(p.color) }} />
        ))}
      </div>
      <div className="legend">
        {parts.map(({ p, v }) => (
          <span key={p.id}>
            <i className="dot" style={{ background: colorOf(p.color) }} />
            {p.name} {Math.round(v * 100)}%
          </span>
        ))}
      </div>
    </>
  );
}

function Artwork({ c, slot }: { c: ScoredCandidate; slot: PlanItem["slot"] }) {
  const [broken, setBroken] = useState(false);
  if (c.entity.image && !broken) return <img className="artwork" src={c.entity.image} alt="" onError={() => setBroken(true)} />;
  return (
    <div className="artwork placeholder" aria-hidden>
      <SlotIcon slot={slot} size={26} />
    </div>
  );
}

function ItemCard({
  item,
  result,
  people,
  onSwap,
  onVeto,
  busy,
}: {
  item: PlanItem;
  result?: SlotResult;
  people: Person[];
  onSwap: (c: ScoredCandidate) => void;
  onVeto: (c: ScoredCandidate) => void;
  busy: boolean;
}) {
  const [showAlts, setShowAlts] = useState(false);
  const c = item.pick;
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "";
  const baseline = result?.popularBaseline;
  const baselineIsPick = baseline?.entity.id === c.entity.id;
  const baselineWorst = baseline ? Object.entries(baseline.percentiles).sort((a, b) => a[1] - b[1])[0] : undefined;
  const meta = [c.entity.subtitle, c.entity.kind === "place" ? c.entity.address : undefined].filter(Boolean).join(" · ");
  return (
    <article className="card">
      <div className="card-top">
        <Artwork c={c} slot={item.slot} />
        <div className="card-titles">
          <div className="eyebrow">
            <SlotIcon slot={item.slot} size={13} />
            {SLOT_LABELS[item.slot]}
            {result?.location ? ` · ${result.location}` : ""}
            {c.fair && people.length > 1 && (
              <span className="fair-note">
                · <Icon.check size={12} /> Fair for everyone
              </span>
            )}
          </div>
          <h3 className="title-2">{c.entity.name}</h3>
          {meta && (
            <div className="meta">
              <KindIcon kind={c.entity.kind} size={13} />
              <span>{meta}</span>
            </div>
          )}
          {!!c.entity.tags?.length && (
            <div className="chips">
              {c.entity.tags.slice(0, 4).map((t) => (
                <span key={t.id} className={`chip${c.matchedTags.some((m) => m.id === t.id) ? " match" : ""}`}>
                  {t.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card-body">
        <div>
          <h4 className="subsection-title">Predicted fit</h4>
          <FitBars c={c} people={people} />
        </div>
        <div className="why">
          <h4 className="subsection-title">Why this one</h4>
          <p>{item.why}</p>
          {item.tradeoff && (
            <div className="callout">
              <Icon.info size={15} />
              <span>
                <strong>Trade-off.</strong> {item.tradeoff}
              </span>
            </div>
          )}
          {!!c.drivers.length && (
            <div className="drivers">
              <span>Pulled up by</span>
              {c.drivers.slice(0, 3).map((d) => (
                <span key={`${d.personId}-${d.entityId}`} className="driver">
                  <i className="dot" style={{ background: colorOf(people.find((p) => p.id === d.personId)?.color ?? 0) }} />
                  {nameOf(d.personId)}'s {d.entityName}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {people.length > 1 && (
        <div className="card-section">
          <h4 className="subsection-title">Whose favourites pulled it up</h4>
          <Credit c={c} people={people} />
        </div>
      )}

      {baseline && !baselineIsPick && baselineWorst && people.length > 1 && (
        <div className="card-section baseline">
          <span>
            The most popular option, <strong>{baseline.entity.name}</strong>, would leave {nameOf(baselineWorst[0])} at {pct(baselineWorst[1]).toLowerCase()}.
          </span>
          <FitBars c={baseline} people={people} compact />
        </div>
      )}

      <div className="card-section card-actions">
        {!!item.alternatives.length && (
          <button type="button" className="btn btn-plain" onClick={() => setShowAlts((s) => !s)} aria-expanded={showAlts}>
            {showAlts ? "Hide Alternatives" : `${item.alternatives.length} Alternatives`}
          </button>
        )}
        <button type="button" className="btn btn-plain destructive" disabled={busy} onClick={() => onVeto(c)} title="Ask the agent for a different pick">
          Not This One
        </button>
      </div>
      {showAlts && (
        <div className="alts">
          {item.alternatives.map((a) => (
            <div key={a.ref} className="alt">
              <div className="alt-head">
                <div>
                  <div className="alt-name">{a.entity.name}</div>
                  <div className="alt-sub">{a.entity.subtitle}</div>
                </div>
                <button type="button" className="btn btn-tinted" style={{ fontSize: 13, minHeight: 28, padding: "4px 10px" }} onClick={() => onSwap(a)}>
                  Use
                </button>
              </div>
              <FitBars c={a} people={people} compact />
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function TastePanel({ taste, people }: { taste: GroupTaste; people: Person[] }) {
  const byId = new Map(people.map((p) => [p.id, p]));
  return (
    <section className="section" aria-labelledby="taste-title">
      <div className="section-header">
        <h2 id="taste-title">Taste</h2>
        <span>From Qloo taste analysis</span>
      </div>
      <div className="group">
        <div className="row-block">
          <h4 className="subsection-title">Shared</h4>
          {taste.shared.length ? (
            <div className="chips">
              {taste.shared.map((t) => (
                <span key={t.id} className="chip">
                  {t.name}
                  <span className="dots">
                    {Object.entries(t.byPerson)
                      .filter(([, v]) => v >= 0.45)
                      .map(([pid]) => (
                        <i key={pid} className="dot" style={{ background: colorOf(byId.get(pid)?.color ?? 0) }} />
                      ))}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <p className="footnote">No single tag stands out for everyone, so the agent looks for overlap inside each category.</p>
          )}
          {!!taste.pairShared?.length && <p className="footnote">Qloo's compare endpoint adds: {taste.pairShared.slice(0, 4).map((t) => t.name).join(", ")}.</p>}
        </div>
        {!!taste.tensions.length && (
          <div className="row-block">
            <h4 className="subsection-title">Different</h4>
            <div className="chips">
              {taste.tensions.map((t) => {
                const p = byId.get(t.champion);
                return (
                  <span key={t.id} className="chip">
                    {p && <i className="dot" style={{ background: colorOf(p.color) }} />}
                    {t.name}
                    <span className="secondary">{p?.name}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {taste.people.map((tp) => {
          const p = byId.get(tp.personId);
          if (!p) return null;
          return (
            <div key={tp.personId} className="row">
              <div className="fp-row" style={{ width: "100%" }}>
                <Avatar person={p} size={22} />
                <span className="fp-name">{p.name}</span>
                <span className="fp-tags">{tp.topTags.slice(0, 4).map((t) => t.name).join(", ")}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function PlanView({
  plan,
  results,
  people,
  onSwap,
  onVeto,
  onAccept,
  accepted,
  busy,
}: {
  plan: Plan;
  results: Partial<Record<string, SlotResult>>;
  people: Person[];
  onSwap: (slot: PlanItem["slot"], c: ScoredCandidate) => void;
  onVeto: (slot: PlanItem["slot"], c: ScoredCandidate) => void;
  onAccept: () => void;
  accepted: boolean;
  busy: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const weighted = Object.entries(plan.weights ?? {}).filter(([, w]) => Math.abs(w - 1) >= 0.05);
  const copy = async () => {
    const lines = [
      plan.title,
      ...plan.items.map((i) => `• ${SLOT_LABELS[i.slot]}: ${i.pick.entity.name}${i.pick.entity.subtitle ? ` (${i.pick.entity.subtitle})` : ""}`),
      "",
      plan.summary,
      plan.noteForGroup ?? "",
      "Planned with Common Ground, using Qloo's taste graph.",
    ].filter((l, idx, arr) => l !== "" || arr[idx - 1] !== "");
    try {
      await navigator.clipboard.writeText(lines.join("\n").trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <section className="section" aria-live="polite" style={{ gap: 14 }}>
      <header className="plan-head">
        <div>
          <h2 className="title-1">{plan.title}</h2>
          <p className="plan-summary">{plan.summary}</p>
          {weighted.length > 0 && (
            <p className="footnote">
              Fairness ledger: {weighted.map(([id, w]) => `${people.find((p) => p.id === id)?.name ?? id} counted ${w.toFixed(2)}×`).join(", ")}, based on earlier plans you
              accepted.
            </p>
          )}
        </div>
        <div className="plan-actions">
          <button type="button" className="btn btn-plain" onClick={copy}>
            {copied ? <Icon.check size={15} /> : <Icon.copy size={15} />} {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            className={`btn ${accepted ? "done" : "btn-tinted"}`}
            onClick={onAccept}
            disabled={accepted}
            title="Records how well this plan fit each person, so the next plan can even things out"
          >
            {accepted ? (
              <>
                <Icon.check size={15} /> Saved
              </>
            ) : (
              "We're Going"
            )}
          </button>
        </div>
      </header>
      {plan.noteForGroup && <p className="callout">{plan.noteForGroup}</p>}
      {plan.items.map((item) => (
        <ItemCard
          key={`${item.slot}-${item.pick.entity.id}`}
          item={item}
          result={results[item.slot]}
          people={people}
          busy={busy}
          onSwap={(c) => onSwap(item.slot, c)}
          onVeto={(c) => onVeto(item.slot, c)}
        />
      ))}
    </section>
  );
}
