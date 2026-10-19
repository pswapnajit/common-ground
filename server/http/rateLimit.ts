// Best-effort, per-instance sliding-window limiter. On serverless each warm
// instance keeps its own window; that's enough to stop a runaway client from
// burning the Qloo quota or model credits during judging.

const windows = new Map<string, number[]>();
const HOUR = 60 * 60 * 1000;

export function allow(key: string, perHour: number, now = Date.now()): boolean {
  if (perHour <= 0) return true;
  const hits = (windows.get(key) ?? []).filter((t) => now - t < HOUR);
  if (hits.length >= perHour) {
    windows.set(key, hits);
    return false;
  }
  hits.push(now);
  windows.set(key, hits);
  if (windows.size > 5000) {
    for (const [k, v] of windows) if (!v.some((t) => now - t < HOUR)) windows.delete(k);
  }
  return true;
}

export function resetRateLimits() {
  windows.clear();
}
