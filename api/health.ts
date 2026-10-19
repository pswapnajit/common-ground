import { handleHealth } from "../server/http/handlers.js";

export function GET(): Promise<Response> {
  return handleHealth();
}
