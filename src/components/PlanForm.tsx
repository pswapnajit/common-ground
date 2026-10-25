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
    <section className="section" aria-labelledby="plan-title">
      <div className="section-header">
        <h2 id="plan-title">Plan</h2>
        <span>Up to 4</span>
      </div>
      <div className="group">
        <div className="choices" role="group" aria-label="What to plan">
          {ORDER.map((s) => (
            <button key={s} type="button" className={`choice${slots.includes(s) ? " on" : ""}`} aria-pressed={slots.includes(s)} onClick={() => toggle(s)}>
              <SlotIcon slot={s} size={15} />
              {SLOT_LABELS[s]}
            </button>
          ))}
        </div>
        {needsPlace && (
          <label className="row">
            <span className="label-cell">Where</span>
            <input className="field" value={location} maxLength={80} placeholder="City or neighbourhood" onChange={(e) => setLocation(e.target.value)} />
          </label>
        )}
        <label className="row">
          <span className="label-cell">Notes</span>
          <input className="field" value={notes} maxLength={600} placeholder="One vegetarian, nothing too pricey" onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      <button type="button" className="btn btn-filled wide" style={{ marginTop: 10 }} disabled={busy || !!disabledReason} onClick={onPlan}>
        {busy ? "Planning…" : "Find Common Ground"}
      </button>
      {disabledReason && <p className="section-footer">{disabledReason}</p>}
    </section>
  );
}
