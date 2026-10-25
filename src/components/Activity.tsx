import { useEffect, useRef, useState } from "react";
import type { QlooReceipt } from "../../shared/types";
import { Icon } from "../icons";

export interface StepState {
  id: string;
  label: string;
  detail?: string;
  state: "running" | "done" | "error";
}

export function Progress({
  steps,
  thinking,
  running,
  qlooCalls,
  seconds,
  onReceipts,
}: {
  steps: StepState[];
  thinking: string[];
  running: boolean;
  qlooCalls: number;
  seconds: number;
  onReceipts: () => void;
}) {
  const [showNotes, setShowNotes] = useState(false);
  return (
    <section className="section" aria-live="polite">
      <div className="section-header">
        <h2>{running ? "Planning" : "Steps"}</h2>
        <span>{seconds.toFixed(1)} s</span>
      </div>
      <div className="group">
        {steps.map((s) => (
          <div key={s.id} className="row">
            <span className={`indicator${s.state === "error" ? " error" : ""}`}>
              {s.state === "running" ? <span className="spinner" /> : s.state === "done" ? <Icon.check size={16} /> : <Icon.x size={16} />}
            </span>
            <span className="row-main">
              <span className="row-title">{s.label}</span>
              {s.detail && <span className="row-sub">{s.detail}</span>}
            </span>
          </div>
        ))}
        {running && !steps.length && (
          <div className="row">
            <span className="indicator">
              <span className="spinner" />
            </span>
            <span className="row-main">
              <span className="row-title">Starting</span>
            </span>
          </div>
        )}
        {!!thinking.length && (
          <>
            <button type="button" className="row" onClick={() => setShowNotes((s) => !s)} aria-expanded={showNotes}>
              <span className="row-main">
                <span className="row-title">Agent Notes</span>
              </span>
              <span className="row-sub">{thinking.length}</span>
              <span className="row-accessory" style={{ transform: showNotes ? "rotate(90deg)" : undefined }}>
                <Icon.chevron size={15} />
              </span>
            </button>
            {showNotes && (
              <div className="notes-body">
                {thinking.map((t, i) => (
                  <p key={i}>{t}</p>
                ))}
              </div>
            )}
          </>
        )}
        <button type="button" className="row" onClick={onReceipts} disabled={!qlooCalls}>
          <span className="row-main">
            <span className="row-title">Qloo Requests</span>
          </span>
          <span className="row-sub">{qlooCalls}</span>
          <span className="row-accessory">
            <Icon.chevron size={15} />
          </span>
        </button>
      </div>
    </section>
  );
}

export interface ChatMsg {
  role: "user" | "agent";
  text: string;
}

const SUGGESTIONS = ["Somewhere cheaper", "No horror", "Vegetarian-friendly dinner", "Something livelier"];

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
    <section className="section">
      <div className="section-header">
        <h2>Changes</h2>
      </div>
      <div className="group">
        <div className="messages">
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role === "user" ? "me" : "them"}`}>
              {m.text}
            </div>
          ))}
          {busy && <div className="bubble them typing">Re-planning…</div>}
          <div ref={endRef} />
        </div>
        {enabled && (
          <>
            <div className="suggestions">
              {SUGGESTIONS.map((q) => (
                <button key={q} type="button" className="btn btn-tinted" disabled={busy} onClick={() => send(q)}>
                  {q}
                </button>
              ))}
            </div>
            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                send(text);
              }}
            >
              <input value={text} maxLength={600} placeholder="Ask for a change" aria-label="Ask for a change" onChange={(e) => setText(e.target.value)} disabled={busy} />
              <button type="submit" className="send" disabled={busy || !text.trim()} aria-label="Send">
                <Icon.arrowUp size={15} />
              </button>
            </form>
          </>
        )}
      </div>
    </section>
  );
}

export function Receipts({ receipts, open, onClose }: { receipts: QlooReceipt[]; open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const cached = receipts.filter((r) => r.cached).length;
  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-label="Qloo requests" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <div>
            <h2>Qloo Requests</h2>
            <div className="footnote">
              {receipts.length} requests{cached ? `, ${cached} from this server's cache` : ""}. Qloo receives entity ids, never people's names.
            </div>
          </div>
          <button type="button" className="btn btn-plain" onClick={onClose} style={{ fontWeight: 600 }}>
            Done
          </button>
        </header>
        <div className="sheet-body">
          <div className="group">
            {receipts.map((r) => (
              <div key={r.id} className="row-block receipt">
                <div className="receipt-head">
                  <code>GET {r.path}</code>
                  <span className={`status-code${r.status === "mock" ? " mock" : typeof r.status === "number" && r.status < 300 ? "" : " bad"}`}>
                    {r.status === "mock" ? "mock" : r.status}
                  </span>
                  <span className="footnote">
                    {r.results} result{r.results === 1 ? "" : "s"} · {r.cached ? "cached" : `${r.ms} ms`}
                  </span>
                </div>
                {r.purpose && <div className="row-sub">{r.purpose}</div>}
                <dl>
                  {Object.entries(r.params).map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd title={v}>{v.length > 120 ? `${v.slice(0, 120)}… (${v.split(",").length} ids)` : v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
