import { handleSearch } from "../server/http/handlers.js";

export function GET(request: Request): Promise<Response> {
  return handleSearch(request);
}
