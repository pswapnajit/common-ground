// Any OpenAI-compatible chat-completions API (OpenAI, Groq, OpenRouter,
// Together, a local Ollama...). Set LLM_PROVIDER=openai, LLM_BASE_URL,
// LLM_MODEL and OPENAI_API_KEY (or LLM_API_KEY).

import type { ToolSpec } from "../tools.js";
import { LlmUnavailableError, type LlmProvider, type LlmSession, type TurnResult } from "./types.js";

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

export function openaiCompatibleProvider(opts: { apiKey: string; model: string; baseUrl: string }): LlmProvider {
  return {
    name: "openai",
    model: opts.model,
    session(system: string, tools: ToolSpec[], history?: unknown[]): LlmSession {
      const messages: ChatMessage[] = Array.isArray(history) && history.length ? [...(history as ChatMessage[])] : [{ role: "system", content: system }];
      const toolDefs = tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
      return {
        get messages() {
          return messages;
        },
        addUser(text) {
          messages.push({ role: "user", content: text });
        },
        addToolResults(results) {
          for (const r of results) messages.push({ role: "tool", tool_call_id: r.id, content: r.content });
        },
        async turn(timeoutMs?: number): Promise<TurnResult> {
          let res: Response;
          try {
            res = await fetch(`${opts.baseUrl}/chat/completions`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
              body: JSON.stringify({ model: opts.model, messages, tools: toolDefs, tool_choice: "auto" }),
              signal: AbortSignal.timeout(Math.max(5_000, Math.min(25_000, timeoutMs ?? 25_000))),
            });
          } catch (error) {
            throw new LlmUnavailableError(`Could not reach the model API: ${(error as Error).message}`, true);
          }
          if (!res.ok) {
            const detail = (await res.text()).slice(0, 200);
            throw new LlmUnavailableError(`Model API returned ${res.status}: ${detail}`, res.status === 429 || res.status >= 500);
          }
          const data = (await res.json()) as any;
          const choice = data?.choices?.[0];
          const msg = choice?.message ?? {};
          const toolCalls = (msg.tool_calls ?? []).map((c: any) => {
            let input: unknown = {};
            try {
              input = JSON.parse(c.function?.arguments || "{}");
            } catch {
              input = { __invalid_json: c.function?.arguments };
            }
            return { id: c.id, name: c.function?.name, input };
          });
          messages.push({ role: "assistant", content: msg.content ?? null, ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) });
          return {
            text: String(msg.content ?? "").trim(),
            thinking: [],
            toolCalls,
            stop: toolCalls.length ? "tool_use" : choice?.finish_reason === "length" ? "max_tokens" : "end",
          };
        },
      };
    },
  };
}
