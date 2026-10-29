// Web-standard (Request -> Response) handlers, shared by the Vercel functions
// in /api and the local Node server.

import type { EntityKind, HealthResponse, PlanEvent, PlanRequestBody, SearchResponse } from "../../shared/types.js";
import { runPlan } from "../agent/run.js";
import { loadConfig } from "../config.js";
import { URN_BY_KIND } from "../qloo/normalize.js";
import { qlooFor } from "../qloo/index.js";
import { allow } from "./rateLimit.js";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

// A stray rejection or throw must not take down a warm function that is
// streaming other people's plans; log it so it shows in the host's logs.
const g = globalThis as { __cgHandlers?: boolean };
if (!g.__cgHandlers) {
  g.__cgHandlers = true;
  process.on("unhandledRejection", (reason) => console.error("[unhandledRejection]", reason));
  process.on("uncaughtException", (error) => console.error("[uncaughtException]", error));
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

function clientKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

export async function handleHealth(): Promise<Response> {
  const config = loadConfig();
  const offline = config.llm.provider === "offline";
  // Says why the model is off and which deployment answered; never exposes a key.
  const reason = !offline
    ? undefined
    : (process.env.LLM_PROVIDER ?? "").toLowerCase() === "offline"
      ? "LLM_PROVIDER is offline"
      : (process.env.LLM_PROVIDER ?? "").toLowerCase() === "openai"
        ? "OpenAI-compatible provider needs OPENAI_API_KEY and LLM_MODEL"
        : "ANTHROPIC_API_KEY is not set for this deployment";
  const body: HealthResponse = {
    ok: true,
    qloo: config.qloo.mode,
    llm: offline ? "rule-based" : config.llm.provider,
    model: offline ? undefined : config.llm.model,
    ...(reason ? { reason } : {}),
    ...(process.env.VERCEL_ENV ? { deployment: `${process.env.VERCEL_ENV} ${process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? ""}`.trim() } : {}),
  };
  return json(body);
}

const SEARCH_KINDS: EntityKind[] = ["movie", "tv_show", "artist", "book", "place", "destination", "podcast", "video_game"];

export async function handleSearch(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const kind = url.searchParams.get("kind") as EntityKind | null;
  if (q.length < 2) return json({ results: [], mode: loadConfig().qloo.mode } satisfies SearchResponse);
  if (!allow(`search:${clientKey(request)}`, 240)) return json({ error: "Too many searches. Try again in a minute." }, 429);
  const config = loadConfig();
  const qloo = qlooFor(config);
  const types = kind && SEARCH_KINDS.includes(kind) ? [URN_BY_KIND[kind]] : SEARCH_KINDS.filter((k) => k !== "place").map((k) => URN_BY_KIND[k]);
  try {
    const results = await qloo.search(q, { types, take: 8 }, "Typeahead");
    const body: SearchResponse = { results: results.slice(0, 8), mode: qloo.mode };
    return json(body, 200, { "Cache-Control": "private, max-age=300" });
  } catch (error) {
    return json({ error: (error as Error).message, results: [], mode: qloo.mode }, 502);
  }
}

export async function handlePlan(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Use POST" }, 405);
  const config = loadConfig();
  if (!allow(`plan:${clientKey(request)}`, config.rateLimitPerHour)) {
    return json({ error: "That's a lot of plans in an hour. Please try again a bit later." }, 429);
  }
  let body: PlanRequestBody;
  try {
    const text = await request.text();
    if (text.length > 600_000) return json({ error: "Request too large" }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: PlanEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };
      // Keep proxies from closing a quiet connection while Qloo or the model works.
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode("\n"));
        } catch {
          // The client went away: a throw here would be uncaught and kill the function.
          closed = true;
        }
      }, 10_000);
      const started = Date.now();
      try {
        await runPlan(body, config, emit);
        console.log(`[plan] done in ${Date.now() - started} ms`);
      } catch (error) {
        console.error(`[plan] failed after ${Date.now() - started} ms`, error);
        emit({ type: "error", message: (error as Error).message || "Something went wrong" });
        emit({ type: "done" });
      } finally {
        clearInterval(heartbeat);
        try {
          if (!closed) controller.close();
        } catch {
          /* already closed */
        }
        closed = true;
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
