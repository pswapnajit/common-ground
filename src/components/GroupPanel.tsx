import { useMemo, useState } from "react";
import type { EntityCard, Person } from "../../shared/types";
import { Icon, KindIcon } from "../icons";
import { colorOf } from "../store";
import { EntitySearch } from "./EntitySearch";

export function Avatar({ person, size = 30 }: { person: Pick<Person, "name" | "color">; size?: number }) {
  return (
    <span className="avatar" style={{ background: colorOf(person.color), width: size, height: size, fontSize: size * 0.43 }} aria-hidden>
      {person.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

function PersonBlock({
  person,
  onChange,
  onRemove,
  canRemove,
  ledger,
}: {
  person: Person;
  onChange: (p: Person) => void;
  onRemove: () => void;
  canRemove: boolean;
  ledger?: number[];
}) {
  const [adding, setAdding] = useState(person.likes.length === 0);
  const exclude = useMemo(() => new Set(person.likes.map((l) => l.id)), [person.likes]);
  const add = (e: EntityCard) => {
    if (person.likes.length >= 12 || exclude.has(e.id)) return;
    onChange({ ...person, likes: [...person.likes, e] });
  };
  const avg = ledger?.length ? ledger.reduce((a, b) => a + b, 0) / ledger.length : undefined;
  return (
    <div className="row-block">
      <div className="person-head">
        <Avatar person={person} />
        <input className="person-name" value={person.name} maxLength={24} aria-label="Name" onChange={(e) => onChange({ ...person, name: e.target.value })} />
        {avg !== undefined && (
          <span
            className="ledger"
            title="Average predicted fit in the plans you accepted together. The next plan gives a little more weight to whoever has compromised most."
          >
            {Math.round(avg * 100)}% fit, {ledger!.length} plan{ledger!.length === 1 ? "" : "s"}
          </span>
        )}
        {canRemove && (
          <button type="button" className="icon-btn" aria-label={`Remove ${person.name}`} onClick={onRemove}>
            <Icon.x size={15} />
          </button>
        )}
      </div>
      <div className="tokens">
        {person.likes.map((l) => (
          <span key={l.id} className="token" title={l.subtitle ? `${l.name} · ${l.subtitle}` : l.name}>
            <KindIcon kind={l.kind} size={12} />
            <span className="token-name">{l.name}</span>
            <button type="button" aria-label={`Remove ${l.name}`} onClick={() => onChange({ ...person, likes: person.likes.filter((x) => x.id !== l.id) })}>
              <Icon.x size={11} />
            </button>
          </span>
        ))}
        {!adding && person.likes.length < 12 && (
          <button type="button" className="token-add" onClick={() => setAdding(true)}>
            <Icon.plus size={12} /> Add
          </button>
        )}
      </div>
      {adding && person.likes.length < 12 && <EntitySearch onPick={add} exclude={exclude} autoFocus={person.likes.length > 0} />}
    </div>
  );
}

export function GroupPanel({
  group,
  onChange,
  onAdd,
  ledger,
}: {
  group: Person[];
  onChange: (g: Person[]) => void;
  onAdd: () => void;
  ledger: Record<string, number[]>;
}) {
  return (
    <section className="section" aria-labelledby="people-title">
      <div className="section-header">
        <h2 id="people-title">People</h2>
        <span>{group.length} of 6</span>
      </div>
      <div className="group">
        {group.map((p, i) => (
          <PersonBlock
            key={p.id}
            person={p}
            ledger={ledger[p.id]}
            canRemove={group.length > 1}
            onRemove={() => onChange(group.filter((x) => x.id !== p.id))}
            onChange={(np) => onChange(group.map((x, j) => (j === i ? np : x)))}
          />
        ))}
        {group.length < 6 && (
          <button type="button" className="row add-row" onClick={onAdd}>
            <Icon.plus size={16} /> Add Person
          </button>
        )}
      </div>
      <p className="section-footer">Add three or four favourites per person, in any category. They don't need to match.</p>
    </section>
  );
}
