import type { ToolSpec } from "../tools.js";

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface TurnResult {
  text: string;
  thinking: string[];
  toolCalls: ToolCall[];
  stop: "tool_use" | "end" | "max_tokens" | "refusal" | "other";
}

/** A conversation with one model. Messages are kept in the provider's own format (append-only). */
export interface LlmSession {
  readonly messages: unknown[];
  addUser(text: string): void;
  turn(): Promise<TurnResult>;
  addToolResults(results: Array<{ id: string; content: string; isError?: boolean }>): void;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  session(system: string, tools: ToolSpec[], history?: unknown[]): LlmSession;
}

export class LlmUnavailableError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "LlmUnavailableError";
  }
}
