// Reads configuration from the environment. Switching Qloo from mock to live is
// one line: set QLOO_API_KEY (QLOO_MODE defaults to "auto").

export type QlooMode = "live" | "mock";
export type LlmProviderName = "anthropic" | "openai" | "offline";

export interface AppConfig {
  qloo: {
    mode: QlooMode;
    apiKey?: string;
    baseUrl: string;
    timeoutMs: number;
  };
  llm: {
    provider: LlmProviderName;
    model: string;
    effort: "low" | "medium" | "high";
    anthropicKey?: string;
    openaiKey?: string;
    openaiBaseUrl: string;
    maxSteps: number;
  };
  rateLimitPerHour: number;
}

const DEFAULT_MODELS: Record<LlmProviderName, string> = {
  anthropic: "claude-opus-5-5",
  openai: "",
  offline: "rule-based",
};

function clean(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const qlooKey = clean(env.QLOO_API_KEY);
  const qlooModeSetting = (clean(env.QLOO_MODE) ?? "auto").toLowerCase();
  // "live" needs a key; without one the mock is used so the app still runs.
  const qlooMode: QlooMode = qlooModeSetting === "mock" || !qlooKey ? "mock" : "live";

  const anthropicKey = clean(env.ANTHROPIC_API_KEY);
  const openaiKey = clean(env.OPENAI_API_KEY) ?? clean(env.LLM_API_KEY);
  const providerSetting = (clean(env.LLM_PROVIDER) ?? "anthropic").toLowerCase();
  let provider: LlmProviderName =
    providerSetting === "openai" ? "openai" : providerSetting === "offline" ? "offline" : "anthropic";
  // No key for the chosen provider: fall back to the rule-based planner so the app still works.
  if (provider === "anthropic" && !anthropicKey) provider = "offline";
  // OpenAI-compatible providers need an explicit model name (LLM_MODEL).
  if (provider === "openai" && (!openaiKey || !clean(env.LLM_MODEL))) provider = "offline";

  const effortSetting = (clean(env.LLM_EFFORT) ?? "low").toLowerCase();
  const effort = effortSetting === "high" ? "high" : effortSetting === "medium" ? "medium" : "low";

  return {
    qloo: {
      mode: qlooMode,
      apiKey: qlooKey,
      baseUrl: (clean(env.QLOO_BASE_URL) ?? "https://hackathon.api.qloo.com").replace(/\/+$/, ""),
      timeoutMs: Number(clean(env.QLOO_TIMEOUT_MS) ?? 15000),
    },
    llm: {
      provider,
      model: provider === "offline" ? DEFAULT_MODELS.offline : clean(env.LLM_MODEL) ?? DEFAULT_MODELS[provider],
      effort,
      anthropicKey,
      openaiKey,
      openaiBaseUrl: (clean(env.LLM_BASE_URL) ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
      maxSteps: Number(clean(env.AGENT_MAX_STEPS) ?? 8),
    },
    rateLimitPerHour: Number(clean(env.RATE_LIMIT_PER_HOUR) ?? 40),
  };
}
