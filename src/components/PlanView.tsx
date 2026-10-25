import { useState } from "react";
import type { GroupTaste, Person, Plan, PlanItem, ScoredCandidate, SlotResult } from "../../shared/types";
import { SLOT_LABELS } from "../../shared/types";
import { Icon, KindIcon, SlotIcon } from "../icons";
import { colorOf } from "../store";
import { Avatar } from "./GroupPanel";

export function pct(p: number): string {
  if (p >= 0.995) return "#1 pick";
  return `top ${Math.max(1, Math.round((1 - p) * 100))}%`;
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
              {!compact && <span className="fit-name">{p.name}</span>}
              <span className="fit-track">
                <span className="fit-bar" style={{ width: `${Math.max(4, v * 100)}%`, background: colorOf(p.color) }} />
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
    return <p className="muted small credit-even">Qloo's explainability gives everyone's favourites a similar share here: it isn't one person's pick.</p>;
  }
  return (
    <div className="credit">
      <div className="credit-bar" aria-hidden>
        {parts.map(({ p, v }) => (
          <span key={p.id} style={{ width: `${v * 100}%`, background: colorOf(p.color) }} />
        ))}
      </div>
      <div className="credit-legend">
        {parts.map(({ p, v }) => (
          <span key={p.id}>
            <i style={{ background: colorOf(p.color) }} />
            {p.name} {Math.round(v * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}

function Thumb({ c, slot }: { c: ScoredCandidate; slot: PlanItem["slot"] }) {
  const [broken, setBroken] = useState(false);
  if (c.entity.image && !broken) {
    return <img className="thumb" src={c.entity.image} alt="" loading="lazy" onError={() => setBroken(true)} />;
  }
  return (
    <div className={`thumb placeholder slot-${slot}`} aria-hidden>
      <SlotIcon slot={slot} size={28} />
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
  const baselineWorst = baseline
    ? Object.entries(baseline.percentiles).sort((a, b) => a[1] - b[1])[0]
    : undefined;
  return (
    <article className="item">
      <div className="item-top">
        <Thumb c={c} slot={item.slot} />
        <div className="item-main">
          <div className="item-kicker">
            <SlotIcon slot={item.slot} size={13} /> {SLOT_LABELS[item.slot]}
            {result?.location ? ` · ${result.location}` : ""}
            {c.fair && people.length > 1 && <span className="fair-badge">Fair to everyone</span>}
          </div>
          <h3 className="item-name">{c.entity.name}</h3>
          <div className="item-sub">
            <KindIcon kind={c.entity.kind} size={12} />
            {[c.entity.subtitle, c.entity.address && c.entity.kind === "place" ? c.entity.address : undefined].filter(Boolean).join(" · ")}
          </div>
          {!!c.entity.tags?.length && (
            <div className="tag-row">
              {c.entity.tags.slice(0, 5).map((t) => (
                <span key={t.id} className={`tag${c.matchedTags.some((m) => m.id === t.id) ? " shared" : ""}`}>
                  {t.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="item-grid">
        <div>
          <div className="label">Predicted fit, per person</div>
          <FitBars c={c} people={people} />
        </div>
        <div className="item-why">
          <div className="label">Why this one</div>
          <p>{item.why}</p>
          {item.tradeoff && (
            <p className="tradeoff">
              <strong>Trade-off.</strong> {item.tradeoff}
            </p>
          )}
          {!!c.drivers.length && (
            <div className="drivers">
              <span className="label inline">Pulled up by</span>
              {c.drivers.slice(0, 3).map((d) => (
                <span key={`${d.personId}-${d.entityId}`} className="driver">
                  <i style={{ background: colorOf(people.find((p) => p.id === d.personId)?.color ?? 0) }} />
                  {nameOf(d.personId)}'s {d.entityName}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {people.length > 1 && (
        <div className="item-credit">
          <div className="label">Whose taste pulled it up (Qloo explainability)</div>
          <Credit c={c} people={people} />
        </div>
      )}

      {baseline && !baselineIsPick && baselineWorst && people.length > 1 && (
        <div className="baseline">
          <span className="label inline">Compared with the obvious choice</span>
          <span>
            The most popular option, <strong>{baseline.entity.name}</strong>, would leave {nameOf(baselineWorst[0])} at {pct(baselineWorst[1])}.
          </span>
          <FitBars c={baseline} people={people} compact />
        </div>
      )}

      <div className="item-actions">
        {!!item.alternatives.length && (
          <button type="button" className="ghost-btn" onClick={() => setShowAlts((s) => !s)} aria-expanded={showAlts}>
            <Icon.swap size={14} /> {showAlts ? "Hide" : "See"} {item.alternatives.length} alternatives
          </button>
        )}
        <button type="button" className="ghost-btn" disabled={busy} onClick={() => onVeto(c)} title="Ask the agent for a different pick">
          <Icon.ban size={14} /> Not this one
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
                <button type="button" className="ghost-btn small" onClick={() => onSwap(a)}>
                  Use this
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
  const shared = taste.shared.length ? taste.shared : [];
  return (
    <section className="taste">
      <div className="taste-col">
        <div className="label">Where your tastes meet</div>
        {shared.length ? (
          <div className="tag-cloud">
            {shared.map((t) => (
              <span key={t.id} className="taste-tag">
                {t.name}
                <span className="dots">
                  {Object.entries(t.byPerson)
                    .filter(([, v]) => v >= 0.45)
                    .map(([pid]) => (
                      <i key={pid} style={{ background: colorOf(byId.get(pid)?.color ?? 0) }} />
                    ))}
                </span>
              </span>
            ))}
          </div>
        ) : (
          <p className="muted small">No single tag stands out for everyone, so the agent looks for overlap inside each category instead.</p>
        )}
        {!!taste.pairShared?.length && (
          <p className="muted small">Qloo's compare endpoint also finds: {taste.pairShared.slice(0, 4).map((t) => t.name).join(", ")}.</p>
        )}
      </div>
      {!!taste.tensions.length && (
        <div className="taste-col">
          <div className="label">Where you pull apart</div>
          <div className="tag-cloud">
            {taste.tensions.map((t) => {
              const p = byId.get(t.champion);
              return (
                <span key={t.id} className="taste-tag tension">
                  {p && <i style={{ background: colorOf(p.color) }} />}
                  {t.name}
                  <span className="muted">· mostly {p?.name}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
      <div className="fingerprints">
        {taste.people.map((tp) => {
          const p = byId.get(tp.personId);
          if (!p) return null;
          return (
            <div key={tp.personId} className="fingerprint">
              <Avatar person={p} size={20} />
              <span className="fp-name">{p.name}</span>
              <span className="fp-tags">{tp.topTags.slice(0, 4).map((t) => t.name).join(" · ")}</span>
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
    <section className="plan" aria-live="polite">
      <header className="plan-head">
        <div>
          <div className="eyebrow">The plan</div>
          <h2 className="plan-title">{plan.title}</h2>
          <p className="plan-summary">{plan.summary}</p>
          {weighted.length > 0 && (
            <p className="muted small">
              Fairness ledger: {weighted.map(([id, w]) => `${people.find((p) => p.id === id)?.name ?? id} counted ${w.toFixed(2)}×`).join(", ")}, based on
              earlier plans you accepted.
            </p>
          )}
        </div>
        <div className="plan-actions">
          <button type="button" className="ghost-btn" onClick={copy}>
            {copied ? <Icon.check size={14} /> : <Icon.copy size={14} />} {copied ? "Copied" : "Copy for the group chat"}
          </button>
          <button type="button" className={`ghost-btn${accepted ? " done" : ""}`} onClick={onAccept} disabled={accepted} title="Records how well this plan fit each person, so the next plan can even things out">
            <Icon.check size={14} /> {accepted ? "Saved to your ledger" : "We're going with this"}
          </button>
        </div>
      </header>
      {plan.noteForGroup && <p className="note">{plan.noteForGroup}</p>}
      <div className="items">
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
      </div>
    </section>
  );
}
