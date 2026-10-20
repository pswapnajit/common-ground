// Small localStorage helpers. Everything stays in this browser; failures are ignored.

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`cg:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(`cg:${key}`, JSON.stringify(value));
  } catch {
    // private mode or quota: the app works without persistence
  }
}

export function uid(prefix = "p"): string {
  return `${prefix}${Math.random().toString(36).slice(2, 9)}`;
}

export const PERSON_COLORS = ["#ef6351", "#1fa39a", "#7c5ce0", "#e09a2b", "#3b8fd9", "#d9518c"];

export function colorOf(index: number): string {
  return PERSON_COLORS[((index % PERSON_COLORS.length) + PERSON_COLORS.length) % PERSON_COLORS.length];
}
