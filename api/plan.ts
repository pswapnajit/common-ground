import { handlePlan } from "../server/http/handlers.js";

export function POST(request: Request): Promise<Response> {
  return handlePlan(request);
}
