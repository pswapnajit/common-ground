// Claude via the official Anthropic SDK: a manual tool-use loop so every tool
// call can stream progress to the UI and finalize_plan can be validated.

import Anthropic from "@anthropic-ai/sdk";
import type { ToolSpec } from "../tools.js";
import { LlmUnavailableError, type LlmProvider, type LlmSession, type TurnResult } from "./types.js";

type Msg = Anthropic.Beta.BetaMessageParam;

export function anthropicProvider(opts: { apiKey: string; model: string; effort: "low" | "medium" | "high" }): LlmProvider {
  const client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 2, timeout: 60_000 });
  // Server-side refusal fallback (routes a declined request to Anthropic's
  // recommended substitute model). Not offered on Haiku.
  const useFallbacks = !/haiku/i.test(opts.model);

  return {
    name: "anthropic",
    model: opts.model,
    session(system: string, tools: ToolSpec[], history?: unknown[]): LlmSession {
      const messages: Msg[] = Array.isArray(history) ? [...(history as Msg[])] : [];
      const toolDefs: Anthropic.Beta.BetaToolUnion[] = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as Anthropic.Beta.BetaTool.InputSchema,
        strict: true,
      }));

      return {
        get messages() {
          return messages;
        },
        addUser(text: string) {
          messages.push({ role: "user", content: text });
        },
        addToolResults(results) {
          messages.push({
            role: "user",
            content: results.map((r) => ({
              type: "tool_result" as const,
              tool_use_id: r.id,
              content: r.content,
              ...(r.isError ? { is_error: true } : {}),
            })),
          });
        },
        async turn(): Promise<TurnResult> {
          let response: Anthropic.Beta.BetaMessage;
          try {
            response = await client.beta.messages.create({
              model: opts.model,
              max_tokens: 16000,
              system,
              tools: toolDefs,
              tool_choice: { type: "auto" },
              messages,
              thinking: { type: "adaptive", display: "summarized" },
              output_config: { effort: opts.effort },
              cache_control: { type: "ephemeral" },
              ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
            });
          } catch (error) {
            if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
              throw new LlmUnavailableError("The Anthropic API key was rejected.", false);
            }
            if (error instanceof Anthropic.RateLimitError) throw new LlmUnavailableError("Anthropic rate limit reached.", true);
            if (error instanceof Anthropic.BadRequestError) throw new LlmUnavailableError(`Anthropic rejected the request: ${error.message}`, false);
            if (error instanceof Anthropic.APIError) throw new LlmUnavailableError(`Anthropic API error ${error.status ?? ""}`.trim(), true);
            throw new LlmUnavailableError(`Could not reach Anthropic: ${(error as Error).message}`, true);
          }

          // Keep the full content (thinking blocks included) so the next turn is valid.
          messages.push({ role: "assistant", content: response.content as Anthropic.Beta.BetaContentBlockParam[] });

          if (response.stop_reason === "refusal") {
            return { text: "", thinking: [], toolCalls: [], stop: "refusal" };
          }
          const text: string[] = [];
          const thinking: string[] = [];
          const toolCalls: TurnResult["toolCalls"] = [];
          for (const block of response.content) {
            if (block.type === "text") text.push(block.text);
            else if (block.type === "thinking" && block.thinking) thinking.push(block.thinking);
            else if (block.type === "tool_use") toolCalls.push({ id: block.id, name: block.name, input: block.input });
          }
          if (response.stop_reason === "max_tokens" && toolCalls.length) {
            // A cut-off tool call may carry partial input; don't run it.
            return { text: text.join("\n"), thinking, toolCalls: [], stop: "max_tokens" };
          }
          return {
            text: text.join("\n").trim(),
            thinking,
            toolCalls,
            stop: toolCalls.length ? "tool_use" : response.stop_reason === "end_turn" ? "end" : "other",
          };
        },
      };
    },
  };
}
