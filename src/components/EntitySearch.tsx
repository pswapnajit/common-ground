import { useEffect, useRef, useState } from "react";
import type { EntityCard, EntityKind } from "../../shared/types";
import { searchEntities } from "../api";
import { Icon, KIND_LABEL, KindIcon } from "../icons";

const FILTERS: Array<{ kind?: EntityKind; label: string }> = [
  { label: "All" },
  { kind: "movie", label: "Films" },
  { kind: "tv_show", label: "TV" },
  { kind: "artist", label: "Music" },
  { kind: "book", label: "Books" },
  { kind: "place", label: "Places" },
  { kind: "destination", label: "Travel" },
  { kind: "podcast", label: "Podcasts" },
  { kind: "video_game", label: "Games" },
];

export function EntitySearch({ onPick, exclude, autoFocus }: { onPick: (e: EntityCard) => void; exclude: Set<string>; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<EntityKind | undefined>();
  const [results, setResults] = useState<EntityCard[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      setError(undefined);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchEntities(q.trim(), kind, controller.signal);
        setResults(res.results.filter((r) => !exclude.has(r.id)));
        setError(undefined);
        setActive(0);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, kind, exclude]);

  const pick = (e: EntityCard) => {
    onPick(e);
    setQ("");
    setResults([]);
    inputRef.current?.focus();
  };

  return (
    <div className="search" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <div className="search-row">
        <Icon.search size={15} />
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={q}
          placeholder="Search films, shows, music, books, places"
          aria-label="Search Qloo for a favourite"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && results[active]) {
              e.preventDefault();
              pick(results[active]);
            } else if (e.key === "Escape") setOpen(false);
          }}
        />
        <select className="kind-select" value={kind ?? ""} aria-label="Category" onChange={(e) => setKind((e.target.value || undefined) as EntityKind | undefined)}>
          {FILTERS.map((f) => (
            <option key={f.label} value={f.kind ?? ""}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      {open && q.trim().length >= 2 && (
        <div className="menu" role="listbox">
          {loading && !results.length && <div className="menu-empty">Searching…</div>}
          {error && <div className="menu-empty error">{error}</div>}
          {!loading && !error && !results.length && <div className="menu-empty">No results. Try another spelling or category.</div>}
          {results.map((r, i) => (
            <button
              key={r.id}
              type="button"
              role="option"
              aria-selected={i === active}
              className={`menu-item${i === active ? " active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(r)}
            >
              <span className="kind-tile">
                <KindIcon kind={r.kind} size={14} />
              </span>
              <span className="menu-text">
                <span className="menu-name">{r.name}</span>
                <span className="menu-sub">
                  {KIND_LABEL[r.kind]}
                  {r.subtitle ? ` · ${r.subtitle}` : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
