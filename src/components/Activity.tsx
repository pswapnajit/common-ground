import { useEffect, useRef, useState } from "react";
import type { QlooReceipt } from "../../shared/types";
import { Icon } from "../icons";

export interface StepState {
  id: string;
  label: string;
  detail?: string;
  state: "running" | "done" | "error";
}

export function Timeline({ steps, thinking, running, qlooCalls, seconds }: { steps: StepState[]; thinking: string[]; running: boolean; qlooCalls: number; seconds: number }) {
  const [showNotes, setShowNotes] = useState(false);
  return (
    <section className="timeline" aria-live="polite">
      <div className="timeline-head">
        <span className="label inline">{running ? "Working on it" : "What the agent did"}</span>
        <span className="muted small">
          {qlooCalls} Qloo call{qlooCalls === 1 ? "" : "s"} · {seconds.toFixed(1)}s
        </span>
      </div>
      <ol>
        {steps.map((s) => (
          <li key={s.id} className={`step ${s.state}`}>
            <span className="step-mark">{s.state === "running" ? <span className="spinner" /> : s.state === "done" ? <Icon.check size={12} /> : <Icon.x size={12} />}</span>
            <span className="step-text">
              <span className="step-label">{s.label}</span>
              {s.detail && <span className="step-detail">{s.detail}</span>}
            </span>
          </li>
        ))}
        {running && !steps.length && (
          <li className="step running">
            <span className="step-mark">
              <span className="spinner" />
            </span>
            <span className="step-text">
              <span className="step-label">Starting the agent</span>
            </span>
          </li>
        )}
      </ol>
      {!!thinking.length && (
        <div className="notes">
          <button type="button" className="link-btn" onClick={() => setShowNotes((s) => !s)} aria-expanded={showNotes}>
            {showNotes ? "Hide" : "Show"} the agent's reasoning notes ({thinking.length})
          </button>
          {showNotes && (
            <div className="notes-body">
              {thinking.map((t, i) => (
                <p key={i}>{t}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export interface ChatMsg {
  role: "user" | "agent";
  text: string;
}

const QUICK = ["Somewhere cheaper", "No horror, please", "Make dinner vegetarian-friendly", "Something more lively"];

export function Chat({ messages, onSend, busy, enabled }: { messages: ChatMsg[]; onSend: (t: string) => void; busy: boolean; enabled: boolean }) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Newer browsers return a Promise from scrollIntoView; never hand it to React as a cleanup.
    void endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages.length]);
  const send = (t: string) => {
    const v = t.trim();
    if (!v || busy) return;
    onSend(v);
    setText("");
  };
  return (
    <section className="chat">
      <div className="label">Talk to the agent</div>
      <div className="chat-log">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.text}
          </div>
        ))}
        {busy && <div className="bubble agent typing">Re-planning…</div>}
        <div ref={endRef} />
      </div>
      {enabled && (
        <>
          <div className="quick">
            {QUICK.map((q) => (
              <button key={q} type="button" className="quick-chip" disabled={busy} onClick={() => send(q)}>
                {q}
              </button>
            ))}
          </div>
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <input value={text} maxLength={600} placeholder='Ask for a change: "Jun hates sushi", "earlier film"…' onChange={(e) => setText(e.target.value)} disabled={busy} />
            <button type="submit" className="icon-btn solid" disabled={busy || !text.trim()} aria-label="Send">
              <Icon.send size={15} />
            </button>
          </form>
        </>
      )}
    </section>
  );
}

export function Receipts({ receipts, open, onClose }: { receipts: QlooReceipt[]; open: boolean; onClose: () => void }) {
  if (!open) return null;
  const total = receipts.length;
  const cached = receipts.filter((r) => r.cached).length;
  return (
    <div className="drawer-wrap" role="dialog" aria-modal="true" aria-label="Qloo receipts" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <div>
            <div className="eyebrow">Receipts</div>
            <h2>Every Qloo request in this plan</h2>
            <p className="muted small">
              {total} requests{cached ? `, ${cached} served from this server's private cache` : ""}. Names never leave your browser and the agent; Qloo only sees
              entity ids.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon.x size={16} />
          </button>
        </header>
        <ol className="receipts">
          {receipts.map((r) => (
            <li key={r.id} className="receipt">
              <div className="receipt-head">
                <code>GET {r.path}</code>
                <span className={`status s${String(r.status)}`}>{r.status === "mock" ? "mock" : r.status}</span>
                <span className="muted small">
                  {r.results} result{r.results === 1 ? "" : "s"} · {r.cached ? "cached" : `${r.ms} ms`}
                </span>
              </div>
              {r.purpose && <div className="receipt-purpose">{r.purpose}</div>}
              <dl>
                {Object.entries(r.params).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd title={v}>{v.length > 120 ? `${v.slice(0, 120)}… (${v.split(",").length} ids)` : v}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
