import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentHistory,
  GroupTaste,
  HealthResponse,
  Person,
  Plan,
  PlanEvent,
  PlanRequestBody,
  QlooReceipt,
  RunStatus,
  ScoredCandidate,
  SlotKind,
  SlotResult,
} from "../shared/types";
import { LOCATED_SLOTS, SLOT_LABELS } from "../shared/types";
import { health, resolveOne, streamPlan } from "./api";
import { Chat, Receipts, Timeline, type ChatMsg, type StepState } from "./components/Activity";
import { GroupPanel } from "./components/GroupPanel";
import { PlanForm } from "./components/PlanForm";
import { PlanView, TastePanel } from "./components/PlanView";
import { Icon } from "./icons";
import { SAMPLES, type SampleGroup } from "./samples";
import { load, save, uid } from "./store";

const REPO_URL = "https://github.com/pswapnajit/common-ground";

interface RunState {
  running: boolean;
  status?: RunStatus;
  steps: StepState[];
  thinking: string[];
  receipts: QlooReceipt[];
  taste?: GroupTaste;
  results: Partial<Record<SlotKind, SlotResult>>;
  plan?: Plan;
  history?: AgentHistory;
  error?: string;
  startedAt?: number;
  endedAt?: number;
}

const EMPTY_RUN: RunState = { running: false, steps: [], thinking: [], receipts: [], results: {} };

function newPerson(index: number): Person {
  return { id: uid(), name: ["Alex", "Sam", "Jordan", "Riley", "Casey", "Morgan"][index % 6], color: index, likes: [] };
}

export default function App() {
  const [group, setGroup] = useState<Person[]>(() => load("group", [newPerson(0), newPerson(1)]));
  const [slots, setSlots] = useState<SlotKind[]>(() => load("slots", ["dinner", "movie"]));
  const [location, setLocation] = useState<string>(() => load("location", "New York City"));
  const [notes, setNotes] = useState<string>(() => load("notes", ""));
  const [ledger, setLedger] = useState<Record<string, number[]>>(() => load("ledger", {}));
  const [vetoes, setVetoes] = useState<Partial<Record<SlotKind, string[]>>>({});
  const [run, setRun] = useState<RunState>(EMPTY_RUN);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [accepted, setAccepted] = useState(false);
  const [showReceipts, setShowReceipts] = useState(false);
  const [loadingSample, setLoadingSample] = useState<string>();
  const [server, setServer] = useState<HealthResponse>();
  const [theme, setTheme] = useState<string>(() => load("theme", ""));
  const [now, setNow] = useState(Date.now());
  const abortRef = useRef<AbortController | undefined>(undefined);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    save("group", group);
    save("slots", slots);
    save("location", location);
    save("notes", notes);
    save("ledger", ledger);
  }, [group, slots, location, notes, ledger]);
  useEffect(() => {
    save("theme", theme);
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  }, [theme]);
  useEffect(() => {
    health().then(setServer);
  }, []);
  useEffect(() => {
    if (!run.running) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [run.running]);

  const onEvent = useCallback((e: PlanEvent) => {
    setRun((r) => {
      switch (e.type) {
        case "status":
          return { ...r, status: e.status };
        case "step": {
          const i = r.steps.findIndex((s) => s.id === e.id);
          const step = { id: e.id, label: e.label, detail: e.detail, state: e.state };
          return { ...r, steps: i >= 0 ? r.steps.map((s, j) => (j === i ? step : s)) : [...r.steps, step] };
        }
        case "thinking":
          return { ...r, thinking: [...r.thinking, e.text] };
        case "qloo":
          return { ...r, receipts: [...r.receipts, e.receipt] };
        case "taste":
          return { ...r, taste: e.taste };
        case "slot":
          return { ...r, results: { ...r.results, [e.result.slot]: e.result } };
        case "plan":
          return { ...r, plan: e.plan };
        case "history":
          return { ...r, history: e.history };
        case "error":
          return { ...r, error: e.message };
        case "done":
          return { ...r, running: false, endedAt: Date.now() };
        default:
          return r;
      }
    });
    if (e.type === "message") setChat((c) => [...c, { role: "agent", text: e.text }]);
  }, []);

  const start = useCallback(
    async (body: PlanRequestBody, keep: boolean) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setAccepted(false);
      setRun((r) => ({
        ...(keep ? { ...r, steps: [], thinking: [], receipts: [] } : EMPTY_RUN),
        running: true,
        error: undefined,
        startedAt: Date.now(),
        endedAt: undefined,
      }));
      setTimeout(() => {
        void resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
      try {
        await streamPlan(body, onEvent, controller.signal);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setRun((r) => ({ ...r, error: (error as Error).message }));
      } finally {
        setRun((r) => (r.running ? { ...r, running: false, endedAt: Date.now() } : r));
      }
    },
    [onEvent],
  );

  const ready = group.filter((p) => p.likes.length > 0);
  const disabledReason = !ready.length
    ? "Add at least one favourite for someone first."
    : !slots.length
      ? "Pick at least one thing to plan."
      : undefined;

  const planNow = (g = group, s = slots, loc = location, n = notes) => {
    const summary = `${s.map((x) => SLOT_LABELS[x]).join(" + ")}${s.some((x) => LOCATED_SLOTS.includes(x)) ? ` in ${loc || "New York City"}` : ""}${n.trim() ? `. ${n.trim()}` : ""}`;
    setChat([{ role: "user", text: summary }]);
    setVetoes({});
    start({ group: g, slots: s, location: loc, notes: n, ledger }, false);
  };

  const followUp = (message: string, extraVetoes = vetoes) => {
    setChat((c) => [...c, { role: "user", text: message }]);
    start({ group, slots, location, notes, ledger, message, history: run.history, vetoes: extraVetoes }, true);
  };

  const veto = (slot: SlotKind, c: ScoredCandidate) => {
    const next = { ...vetoes, [slot]: [...(vetoes[slot] ?? []), c.entity.id] };
    setVetoes(next);
    followUp(`Not ${c.entity.name} for ${SLOT_LABELS[slot].toLowerCase()}. Find another option that works for everyone.`, next);
  };

  const swap = (slot: SlotKind, c: ScoredCandidate) => {
    setRun((r) => {
      if (!r.plan) return r;
      const items = r.plan.items.map((it) => {
        if (it.slot !== slot) return it;
        const alternatives = [it.pick, ...it.alternatives.filter((a) => a.ref !== c.ref)];
        const people = group.filter((p) => c.percentiles[p.id] !== undefined);
        const low = people.sort((a, b) => c.percentiles[a.id] - c.percentiles[b.id])[0];
        return {
          ...it,
          pick: c,
          alternatives,
          why: `You chose this one.${low ? ` It sits in ${low.name}'s top ${Math.max(1, Math.round((1 - c.percentiles[low.id]) * 100))}%, the lowest fit in the group.` : ""}`,
          tradeoff: undefined,
        };
      });
      return { ...r, plan: { ...r.plan, items } };
    });
    setAccepted(false);
  };

  const accept = () => {
    if (!run.plan) return;
    const next = { ...ledger };
    for (const p of group) {
      const xs = run.plan.items.map((i) => i.pick.percentiles[p.id]).filter((x): x is number => typeof x === "number");
      if (!xs.length) continue;
      next[p.id] = [...(next[p.id] ?? []), xs.reduce((a, b) => a + b, 0) / xs.length].slice(-10);
    }
    setLedger(next);
    setAccepted(true);
  };

  const loadSample = async (s: SampleGroup) => {
    setLoadingSample(s.id);
    try {
      const people: Person[] = await Promise.all(
        s.people.map(async (p, i) => ({
          id: `${s.id}-${i}`,
          name: p.name,
          color: i,
          likes: (await Promise.all(p.likes.map(([name, kind]) => resolveOne(name, kind).catch(() => undefined)))).filter((x): x is NonNullable<typeof x> => Boolean(x)),
        })),
      );
      setGroup(people);
      setSlots(s.slots);
      setLocation(s.location ?? "New York City");
      setNotes(s.notes ?? "");
      planNow(people, s.slots, s.location ?? "New York City", s.notes ?? "");
    } catch (error) {
      setRun((r) => ({ ...r, error: `Couldn't load the sample: ${(error as Error).message}` }));
    } finally {
      setLoadingSample(undefined);
    }
  };

  const qlooMode = run.status?.qloo ?? server?.qloo;
  const llm = run.status?.llm ?? server?.llm;
  const model = run.status?.model ?? server?.model;
  const seconds = run.startedAt ? ((run.endedAt ?? now) - run.startedAt) / 1000 : 0;
  const hasRun = run.running || run.plan || run.steps.length > 0 || run.error;
  const people = group.filter((p) => p.likes.length > 0);

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Common Ground home">
          <svg width="30" height="22" viewBox="0 0 44 32" aria-hidden>
            <circle cx="15" cy="16" r="13" fill="#ef6351" fillOpacity="0.9" />
            <circle cx="29" cy="16" r="13" fill="#1fa39a" fillOpacity="0.9" />
            <path d="M22 5.1a13 13 0 0 1 0 21.8a13 13 0 0 1 0-21.8z" className="brand-overlap" />
          </svg>
          <span>Common Ground</span>
        </a>
        <div className="topbar-right">
          {qlooMode && (
            <span className={`pill ${qlooMode}`} title={qlooMode === "live" ? "Requests go to Qloo's hackathon API" : "No Qloo key on the server: results come from a small synthetic catalogue"}>
              <i /> {qlooMode === "live" ? "Qloo live" : "Demo data"}
            </span>
          )}
          {llm && (
            <span className="pill neutral" title={llm === "rule-based" ? "No language model configured: a rule-based planner runs the same Qloo tools" : `Agent model: ${model}`}>
              {llm === "rule-based" ? "Rule-based agent" : `Agent: ${prettyModel(model)}`}
            </span>
          )}
          <button type="button" className="icon-btn" aria-label="Toggle dark mode" onClick={() => setTheme(isDark(theme) ? "light" : "dark")}>
            {isDark(theme) ? <Icon.sun size={16} /> : <Icon.moon size={16} />}
          </button>
          <a className="icon-btn" href={REPO_URL} target="_blank" rel="noreferrer" aria-label="Source code on GitHub">
            <Icon.github size={16} />
          </a>
        </div>
      </header>

      <main className="layout">
        <div className="left">
          <GroupPanel group={group} onChange={setGroup} onAdd={() => setGroup([...group, newPerson(group.length)])} ledger={ledger} />
          <PlanForm
            slots={slots}
            setSlots={setSlots}
            location={location}
            setLocation={setLocation}
            notes={notes}
            setNotes={setNotes}
            busy={run.running}
            disabledReason={disabledReason}
            onPlan={() => planNow()}
          />
          <p className="privacy">
            Your group stays in this browser. Qloo only receives the ids of the films, artists and places you add, never names.
          </p>
        </div>

        <div className="right" ref={resultsRef}>
          {!hasRun && (
            <section className="hero">
              <h1>
                Plans your whole group will <em>actually</em> enjoy.
              </h1>
              <p className="lede">
                Add your people and a few things each of them loves. The agent uses Qloo's taste graph to find where your tastes overlap, scores every option for
                every person, and picks the one that's fair to all of you.
              </p>
              <ol className="how">
                <li>
                  <b>1</b>
                  <span>
                    <strong>Add favourites.</strong> Films, shows, music, books, places. They don't need to match.
                  </span>
                </li>
                <li>
                  <b>2</b>
                  <span>
                    <strong>Qloo finds the overlap.</strong> Its graph links tastes across categories, so a horror fan and a rom-com fan can still share a restaurant.
                  </span>
                </li>
                <li>
                  <b>3</b>
                  <span>
                    <strong>A fair plan, with receipts.</strong> Each person's predicted fit, who gives up what, and every Qloo request behind it.
                  </span>
                </li>
              </ol>
              <div className="samples">
                <div className="label">Try a sample group</div>
                <div className="sample-grid">
                  {SAMPLES.map((s) => (
                    <button key={s.id} type="button" className="sample" disabled={!!loadingSample || run.running} onClick={() => loadSample(s)}>
                      <span className="sample-title">{s.title}</span>
                      <span className="sample-blurb">{s.blurb}</span>
                      <span className="sample-cta">{loadingSample === s.id ? "Loading…" : "Plan this →"}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {hasRun && (
            <>
              {run.status?.notice && <div className="notice">{run.status.notice}</div>}
              {run.error && <div className="notice error">{run.error}</div>}
              <div className="run-head">
                <Timeline steps={run.steps} thinking={run.thinking} running={run.running} qlooCalls={run.receipts.length} seconds={seconds} />
                <button type="button" className="receipt-btn" onClick={() => setShowReceipts(true)} disabled={!run.receipts.length}>
                  <Icon.receipt size={16} />
                  <span>
                    <strong>{run.receipts.length}</strong> Qloo receipts
                  </span>
                </button>
              </div>
              {run.taste && people.length > 1 && <TastePanel taste={run.taste} people={people} />}
              {run.plan && (
                <PlanView
                  plan={run.plan}
                  results={run.results}
                  people={people}
                  onSwap={swap}
                  onVeto={veto}
                  onAccept={accept}
                  accepted={accepted}
                  busy={run.running}
                />
              )}
              {run.running && !run.plan && <div className="skeleton" aria-hidden />}
              <Chat messages={chat} onSend={(t) => followUp(t)} busy={run.running} enabled={!!run.plan} />
              <div className="again">
                <button type="button" className="link-btn" onClick={() => setRun(EMPTY_RUN)} disabled={run.running}>
                  ← Back to sample groups
                </button>
              </div>
            </>
          )}
        </div>
      </main>

      <footer className="footer">
        <span>
          Common Ground is built on the{" "}
          <a href="https://docs.qloo.com/reference/insights-api-deep-dive" target="_blank" rel="noreferrer">
            Qloo Insights API
          </a>{" "}
          for the Qloo Agentic Hackathon. Predicted fit is an estimate from aggregate taste data, not a promise about any one person.
        </span>
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          Source (MIT)
        </a>
      </footer>
      <Receipts receipts={run.receipts} open={showReceipts} onClose={() => setShowReceipts(false)} />
    </div>
  );
}

function isDark(theme: string): boolean {
  if (theme) return theme === "dark";
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

function prettyModel(model?: string): string {
  if (!model) return "model";
  const m = /claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d+))?/.exec(model);
  if (m) return `Claude ${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ""}`;
  return model;
}
