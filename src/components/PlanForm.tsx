import type { SlotKind } from "../../shared/types";
import { LOCATED_SLOTS, SLOT_LABELS } from "../../shared/types";
import { SlotIcon } from "../icons";

const ORDER: SlotKind[] = ["dinner", "drinks", "movie", "series", "music", "book", "trip"];

export function PlanForm({
  slots,
  setSlots,
  location,
  setLocation,
  notes,
  setNotes,
  onPlan,
  busy,
  disabledReason,
}: {
  slots: SlotKind[];
  setSlots: (s: SlotKind[]) => void;
  location: string;
  setLocation: (s: string) => void;
  notes: string;
  setNotes: (s: string) => void;
  onPlan: () => void;
  busy: boolean;
  disabledReason?: string;
}) {
  const toggle = (s: SlotKind) =>
    setSlots(slots.includes(s) ? slots.filter((x) => x !== s) : slots.length >= 4 ? slots : ORDER.filter((x) => x === s || slots.includes(x)));
  const needsPlace = slots.some((s) => LOCATED_SLOTS.includes(s));
  return (
    <section className="panel" aria-labelledby="plan-title">
      <h2 id="plan-title">What are you planning?</h2>
      <div className="slot-grid" role="group" aria-label="Plan items">
        {ORDER.map((s) => (
          <button key={s} type="button" className={`slot-chip${slots.includes(s) ? " on" : ""}`} aria-pressed={slots.includes(s)} onClick={() => toggle(s)}>
            <SlotIcon slot={s} size={15} />
            {SLOT_LABELS[s]}
          </button>
        ))}
      </div>
      {needsPlace && (
        <label className="field">
          <span>Where?</span>
          <input value={location} maxLength={80} placeholder="New York City, Brooklyn, West Village…" onChange={(e) => setLocation(e.target.value)} />
        </label>
      )}
      <label className="field">
        <span>Anything the agent should know?</span>
        <textarea
          rows={2}
          maxLength={600}
          value={notes}
          placeholder="One vegetarian, nothing too pricey, no horror…"
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <button type="button" className="primary-btn" disabled={busy || !!disabledReason} onClick={onPlan}>
        {busy ? "Planning…" : "Find our common ground"}
      </button>
      {disabledReason && <p className="hint center">{disabledReason}</p>}
    </section>
  );
}
