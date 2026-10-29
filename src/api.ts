import type { EntityCard, EntityKind, HealthResponse, PlanEvent, PlanRequestBody, SearchResponse } from "../shared/types";

export async function health(): Promise<HealthResponse | undefined> {
  try {
    const res = await fetch("/api/health");
    return res.ok ? ((await res.json()) as HealthResponse) : undefined;
  } catch {
    return undefined;
  }
}

export async function searchEntities(q: string, kind?: EntityKind, signal?: AbortSignal): Promise<SearchResponse> {
  const params = new URLSearchParams({ q });
  if (kind) params.set("kind", kind);
  const res = await fetch(`/api/search?${params}`, { signal });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `Search failed (${res.status})`);
  return (await res.json()) as SearchResponse;
}

/** Streams NDJSON events from /api/plan. */
export async function streamPlan(body: PlanRequestBody, onEvent: (e: PlanEvent) => void, signal?: AbortSignal): Promise<void> {
  // The server sends a heartbeat every 10 s, so 90 s of silence means it has stopped.
  const quiet = new AbortController();
  signal?.addEventListener("abort", () => quiet.abort());
  let last = Date.now();
  const watchdog = setInterval(() => {
    if (Date.now() - last > 90_000) quiet.abort();
  }, 5_000);
  try {
    await readPlanStream(body, onEvent, quiet.signal, () => (last = Date.now()));
  } catch (error) {
    if (signal?.aborted) throw error;
    if (quiet.signal.aborted || error instanceof TypeError) throw new Error("The connection dropped before the plan was finished. Please try again.");
    throw error;
  } finally {
    clearInterval(watchdog);
  }
}

async function readPlanStream(body: PlanRequestBody, onEvent: (e: PlanEvent) => void, signal: AbortSignal, onActivity: () => void): Promise<void> {
  const res = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail?.error ?? `Planning failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onActivity();
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        onEvent(JSON.parse(line) as PlanEvent);
      } catch {
        // ignore a malformed line rather than failing the whole run
      }
    }
  }
  const rest = buffer.trim();
  if (rest) {
    try {
      onEvent(JSON.parse(rest) as PlanEvent);
    } catch {
      /* ignore */
    }
  }
}

/** Resolves a name to the first Qloo match of the given kind. */
export async function resolveOne(name: string, kind: EntityKind): Promise<EntityCard | undefined> {
  const res = await searchEntities(name, kind);
  const exact = res.results.find((r) => r.name.toLowerCase() === name.toLowerCase());
  return exact ?? res.results[0];
}
