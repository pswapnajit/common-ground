// Qloo API client: one transport (live HTTP or the in-repo mock), a private
// in-memory cache (allowed by the hackathon developer guide; nothing is
// written to disk), request de-duplication, bounded retries, and a receipt
// for every call so the UI can show exactly what was asked of Qloo.

import type { EntityCard, QlooReceipt, TagRef } from "../../shared/types.js";
import { parseExplainability, resultArray, toEntityCard, toTag } from "./normalize.js";

export type ParamValue = string | number | boolean | string[] | undefined | null;
export type QlooParams = Record<string, ParamValue>;

export interface TransportResponse {
  status: number;
  body: unknown;
}

export interface QlooTransport {
  mode: "live" | "mock";
  get(path: string, query: URLSearchParams): Promise<TransportResponse>;
}

export class QlooError extends Error {
  constructor(
    message: string,
    readonly status: number | "network",
    readonly path: string,
  ) {
    super(message);
    this.name = "QlooError";
  }
}

/** Serialises params the way Qloo expects for GET: arrays comma-joined, empty values dropped. */
export function toQuery(params: QlooParams): URLSearchParams {
  const query = new URLSearchParams();
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (value === undefined || value === null || value === "") continue;
    const serialized = Array.isArray(value) ? value.filter(Boolean).join(",") : String(value);
    if (serialized) query.set(key, serialized);
  }
  return query;
}

export function liveTransport(opts: { apiKey: string; baseUrl: string; timeoutMs: number }): QlooTransport {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  return {
    mode: "live",
    async get(path, query) {
      const url = `${opts.baseUrl}${path}?${query.toString()}`;
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
        try {
          const res = await fetch(url, {
            method: "GET",
            headers: { "X-Api-Key": opts.apiKey, Accept: "application/json", "User-Agent": "common-ground/1.0" },
            signal: controller.signal,
          });
          const text = await res.text();
          let body: unknown = {};
          try {
            body = text ? JSON.parse(text) : {};
          } catch {
            body = { message: text.slice(0, 300) };
          }
          if ((res.status === 429 || res.status >= 500) && attempt < 2) {
            const retryAfter = Number(res.headers.get("retry-after"));
            await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 4000) : 400 * 2 ** attempt);
            continue;
          }
          return { status: res.status, body };
        } catch (error) {
          lastError = error;
          if (attempt < 2) await sleep(400 * 2 ** attempt);
        } finally {
          clearTimeout(timer);
        }
      }
      throw new QlooError(`Could not reach Qloo: ${(lastError as Error)?.message ?? "unknown error"}`, "network", path);
    },
  };
}

interface CacheEntry {
  expires: number;
  value: TransportResponse;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 600;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<TransportResponse>>();
let receiptCounter = 0;

export function clearQlooCache() {
  cache.clear();
  inflight.clear();
}

function cacheGet(key: string): TransportResponse | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  cache.delete(key); // refresh LRU position
  cache.set(key, hit);
  return hit.value;
}

function cacheSet(key: string, value: TransportResponse) {
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
}

export interface InsightsResult {
  entities: Array<EntityCard & { affinity?: number; explain: Map<string, number> }>;
  tags: Array<TagRef & { affinity?: number; popularity?: number }>;
  raw: unknown;
}

/** A per-request view of Qloo that records receipts. */
export class Qloo {
  readonly receipts: QlooReceipt[] = [];

  constructor(
    private readonly transport: QlooTransport,
    private readonly onReceipt?: (r: QlooReceipt) => void,
  ) {}

  get mode() {
    return this.transport.mode;
  }

  async get(path: string, params: QlooParams, purpose?: string): Promise<unknown> {
    const query = toQuery(params);
    const key = `${this.transport.mode}:${path}?${query.toString()}`;
    const started = Date.now();
    let cached = false;
    let response = cacheGet(key);
    if (response) {
      cached = true;
    } else {
      let pending = inflight.get(key);
      if (!pending) {
        pending = this.transport.get(path, query).finally(() => inflight.delete(key));
        inflight.set(key, pending);
      }
      try {
        response = await pending;
      } catch (error) {
        this.record(path, query, "error", Date.now() - started, 0, false, purpose);
        throw error;
      }
      if (response.status === 200) cacheSet(key, response);
    }
    const count =
      response.status === 200
        ? Math.max(resultArray(response.body, "entities").length, resultArray(response.body, "tags").length)
        : 0;
    this.record(path, query, this.transport.mode === "mock" ? "mock" : response.status, Date.now() - started, count, cached, purpose);
    if (response.status !== 200) {
      const body = response.body as Record<string, unknown> | undefined;
      const message = String(body?.message ?? body?.reason ?? body?.error ?? `HTTP ${response.status}`);
      throw new QlooError(`Qloo ${path} returned ${response.status}: ${message}`, response.status, path);
    }
    return response.body;
  }

  private record(
    path: string,
    query: URLSearchParams,
    status: QlooReceipt["status"],
    ms: number,
    results: number,
    cached: boolean,
    purpose?: string,
  ) {
    const receipt: QlooReceipt = {
      id: ++receiptCounter,
      path,
      params: Object.fromEntries(query.entries()),
      status,
      ms,
      results,
      cached,
      purpose,
    };
    this.receipts.push(receipt);
    this.onReceipt?.(receipt);
  }

  /** GET /search: resolve a name to entities. */
  async search(query: string, opts: { types?: string[]; take?: number } = {}, purpose?: string): Promise<EntityCard[]> {
    const body = await this.get("/search", { query, types: opts.types, take: opts.take ?? 8 }, purpose);
    return resultArray(body, "entities").map(toEntityCard).filter((e) => e.id);
  }

  /** GET /v2/insights for entities or tags. */
  async insights(params: QlooParams, purpose?: string): Promise<InsightsResult> {
    const body = await this.get("/v2/insights", params, purpose);
    const entityRows = resultArray(body, "entities");
    return {
      entities: entityRows
        .map((raw) => ({ ...toEntityCard(raw), explain: parseExplainability(raw) }))
        .filter((e) => e.id),
      tags: resultArray(body, "tags").map(toTag).filter((t) => t.id),
      raw: body,
    };
  }

  /** GET /v2/tags: find tag ids for a concept ("vegetarian", "rooftop"). */
  async findTags(query: string, opts: { take?: number; parentType?: string } = {}, purpose?: string) {
    const body = await this.get(
      "/v2/tags",
      {
        "filter.query": query,
        "feature.semantic_search": true,
        "filter.parents.types": opts.parentType,
        take: opts.take ?? 8,
      },
      purpose,
    );
    return resultArray(body, "tags").map((raw) => {
      const tag = toTag(raw);
      const parents = Array.isArray(raw.parents)
        ? raw.parents.map((p: any) => (typeof p === "string" ? p : p?.type)).filter(Boolean)
        : [];
      return { ...tag, parents: parents as string[] };
    });
  }

  /** GET /v2/analysis/compare: tags two signal groups share. */
  async compare(a: string[], b: string[], opts: { take?: number } = {}, purpose?: string) {
    const body = await this.get(
      "/v2/analysis/compare",
      { "a.signal.interests.entities": a, "b.signal.interests.entities": b, take: opts.take ?? 12 },
      purpose,
    );
    return resultArray(body, "tags").map(toTag).filter((t) => t.id);
  }

  /** GET /entities: full details for known ids. */
  async entities(ids: string[], purpose?: string): Promise<EntityCard[]> {
    if (!ids.length) return [];
    const body = await this.get("/entities", { entity_ids: ids }, purpose);
    return resultArray(body, "entities").map(toEntityCard).filter((e) => e.id);
  }
}
