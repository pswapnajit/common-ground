import { useMemo, useState } from "react";
import type { EntityCard, Person } from "../../shared/types";
import { Icon, KindIcon } from "../icons";
import { colorOf } from "../store";
import { EntitySearch } from "./EntitySearch";

export function Avatar({ person, size = 28 }: { person: Pick<Person, "name" | "color">; size?: number }) {
  return (
    <span className="avatar" style={{ background: colorOf(person.color), width: size, height: size, fontSize: size * 0.44 }} aria-hidden>
      {person.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

function PersonCard({
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
    <div className="person" style={{ ["--pc" as string]: colorOf(person.color) }}>
      <div className="person-head">
        <Avatar person={person} />
        <input
          className="person-name"
          value={person.name}
          maxLength={24}
          aria-label="Name"
          onChange={(e) => onChange({ ...person, name: e.target.value })}
        />
        {avg !== undefined && (
          <span className="ledger-pill" title="Average fit in the plans you accepted together. The next plan gives a little more weight to whoever has compromised most.">
            {Math.round(avg * 100)}% fit · {ledger!.length} plan{ledger!.length === 1 ? "" : "s"}
          </span>
        )}
        {canRemove && (
          <button type="button" className="icon-btn" aria-label={`Remove ${person.name}`} onClick={onRemove}>
            <Icon.x size={15} />
          </button>
        )}
      </div>
      <div className="likes">
        {person.likes.map((l) => (
          <span key={l.id} className="like-chip" title={l.subtitle ? `${l.name} · ${l.subtitle}` : l.name}>
            <KindIcon kind={l.kind} size={12} />
            <span className="like-name">{l.name}</span>
            <button
              type="button"
              aria-label={`Remove ${l.name}`}
              onClick={() => onChange({ ...person, likes: person.likes.filter((x) => x.id !== l.id) })}
            >
              <Icon.x size={11} />
            </button>
          </span>
        ))}
        {!adding && person.likes.length < 12 && (
          <button type="button" className="like-add" onClick={() => setAdding(true)}>
            <Icon.plus size={12} /> Add
          </button>
        )}
      </div>
      {adding && person.likes.length < 12 && <EntitySearch onPick={add} exclude={exclude} autoFocus={person.likes.length > 0} />}
      {person.likes.length === 0 && <p className="hint">Three or four favourites across any categories works best.</p>}
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
    <section className="panel" aria-labelledby="group-title">
      <div className="panel-title-row">
        <h2 id="group-title">Your group</h2>
        <span className="muted small">{group.length} of 6</span>
      </div>
      <div className="people">
        {group.map((p, i) => (
          <PersonCard
            key={p.id}
            person={p}
            ledger={ledger[p.id]}
            canRemove={group.length > 1}
            onRemove={() => onChange(group.filter((x) => x.id !== p.id))}
            onChange={(np) => onChange(group.map((x, j) => (j === i ? np : x)))}
          />
        ))}
      </div>
      {group.length < 6 && (
        <button type="button" className="ghost-btn wide" onClick={onAdd}>
          <Icon.plus size={14} /> Add a person
        </button>
      )}
    </section>
  );
}
