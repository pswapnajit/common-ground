import type { AppConfig } from "../../config.js";
import { anthropicProvider } from "./anthropic.js";
import { openaiCompatibleProvider } from "./openai.js";
import type { LlmProvider } from "./types.js";

export type { LlmProvider, LlmSession, ToolCall, TurnResult } from "./types.js";
export { LlmUnavailableError } from "./types.js";

/** Returns the configured model provider, or undefined for the rule-based planner. */
export function providerFor(config: AppConfig): LlmProvider | undefined {
  const { llm } = config;
  if (llm.provider === "anthropic" && llm.anthropicKey) {
    return anthropicProvider({ apiKey: llm.anthropicKey, model: llm.model, effort: llm.effort });
  }
  if (llm.provider === "openai" && llm.openaiKey && llm.model) {
    return openaiCompatibleProvider({ apiKey: llm.openaiKey, model: llm.model, baseUrl: llm.openaiBaseUrl });
  }
  return undefined;
}
