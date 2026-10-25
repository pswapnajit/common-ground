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
import { Chat, Progress, Receipts, type ChatMsg, type StepState } from "./components/Activity";
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
  const progress = (
    <Progress
      steps={run.steps}
      thinking={run.thinking}
      running={run.running}
      qlooCalls={run.receipts.length}
      seconds={seconds}
      onReceipts={() => setShowReceipts(true)}
    />
  );

  return (
    <div className="app">
      <header className="navbar">
        <a className="nav-title" href="/" aria-label="Common Ground home">
          <svg width="26" height="18" viewBox="0 0 36 24" aria-hidden fill="none" stroke="var(--accent)" strokeWidth="2.4">
            <circle cx="12" cy="12" r="9" />
            <circle cx="24" cy="12" r="9" />
          </svg>
          Common Ground
        </a>
        <div className="nav-actions">
          {qlooMode && (
            <span
              className={`status ${qlooMode}`}
              title={qlooMode === "live" ? "Requests go to Qloo's hackathon API" : "No Qloo key on the server: results come from a small synthetic catalogue"}
            >
              <i /> {qlooMode === "live" ? "Qloo Live" : "Demo Data"}
            </span>
          )}
          {llm && (
            <span className="status model" title={llm === "rule-based" ? "No language model configured: a rule-based planner runs the same Qloo tools" : `Agent model: ${model}`}>
              {llm === "rule-based" ? "Built-in Planner" : prettyModel(model)}
            </span>
          )}
          <button type="button" className="icon-btn" aria-label="Toggle appearance" onClick={() => setTheme(isDark(theme) ? "light" : "dark")}>
            {isDark(theme) ? <Icon.sun size={17} /> : <Icon.moon size={17} />}
          </button>
          <a className="icon-btn" href={REPO_URL} target="_blank" rel="noreferrer" aria-label="Source code on GitHub">
            <Icon.github size={16} />
          </a>
        </div>
      </header>

      <main className="layout">
        <aside className="sidebar">
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
          <p className="section-footer">Your group stays in this browser. Qloo receives the ids of the things you add, never names.</p>
        </aside>

        <div className="content" ref={resultsRef}>
          {!hasRun && (
            <div className="welcome">
              <div>
                <h1 className="large-title">Plan something everyone will enjoy.</h1>
                <p className="subhead">
                  Add a few favourites for each person. Common Ground uses Qloo's taste graph to score every option for every person, then picks the one that's
                  fairest to the whole group.
                </p>
              </div>
              <section className="section" aria-label="How it works">
                <div className="group">
                  <div className="row-block feature">
                    <span className="feature-icon">
                      <Icon.people size={17} />
                    </span>
                    <span>
                      <div className="feature-title">Add favourites</div>
                      <div className="feature-text">Films, shows, music, books or places for each person. They don't need to overlap.</div>
                    </span>
                  </div>
                  <div className="row-block feature">
                    <span className="feature-icon">
                      <Icon.chart size={17} />
                    </span>
                    <span>
                      <div className="feature-title">Qloo scores every option</div>
                      <div className="feature-text">Each person gets their own predicted fit on the same shortlist, across categories.</div>
                    </span>
                  </div>
                  <div className="row-block feature">
                    <span className="feature-icon">
                      <Icon.shield size={17} />
                    </span>
                    <span>
                      <div className="feature-title">Get a fair plan</div>
                      <div className="feature-text">No pick lands near the bottom of anyone's list, and every trade-off is explained.</div>
                    </span>
                  </div>
                </div>
              </section>
              <section className="section" aria-labelledby="samples-title">
                <div className="section-header">
                  <h2 id="samples-title">Sample Groups</h2>
                </div>
                <div className="group">
                  {SAMPLES.map((s) => (
                    <button key={s.id} type="button" className="row" disabled={!!loadingSample || run.running} onClick={() => loadSample(s)}>
                      <span className="row-main">
                        <span className="row-title">{s.title}</span>
                        <span className="row-sub">{s.blurb}</span>
                      </span>
                      <span className="row-accessory">{loadingSample === s.id ? <span className="spinner" /> : <Icon.chevron size={16} />}</span>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}

          {hasRun && (
            <>
              {run.status?.notice && (
                <div className="notice">
                  <Icon.info size={16} />
                  <span>{run.status.notice}</span>
                </div>
              )}
              {run.error && (
                <div className="notice error">
                  <Icon.info size={16} />
                  <span>{run.error}</span>
                </div>
              )}
              {!run.plan && progress}
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
              {run.taste && people.length > 1 && <TastePanel taste={run.taste} people={people} />}
              {run.plan && progress}
              <div>
                <button type="button" className="btn btn-plain" onClick={() => setRun(EMPTY_RUN)} disabled={run.running}>
                  Sample Groups
                </button>
              </div>
            </>
          )}
        </div>
      </main>

      <footer className="footer">
        <span>
          Built on the{" "}
          <a href="https://docs.qloo.com/reference/insights-api-deep-dive" target="_blank" rel="noreferrer">
            Qloo Insights API
          </a>{" "}
          for the Qloo Agentic Hackathon. Predicted fit is an estimate from aggregate taste data, not a promise about any one person.
        </span>
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          Source code (MIT)
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
