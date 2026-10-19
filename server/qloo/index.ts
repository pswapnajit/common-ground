import type { QlooReceipt } from "../../shared/types.js";
import type { AppConfig } from "../config.js";
import { Qloo, liveTransport, type QlooTransport } from "./client.js";
import { mockTransport } from "./mock.js";

export { Qloo, QlooError, clearQlooCache } from "./client.js";

let shared: QlooTransport | undefined;
let sharedKey = "";

export function transportFor(config: AppConfig): QlooTransport {
  const key = `${config.qloo.mode}:${config.qloo.baseUrl}:${config.qloo.apiKey ? "k" : ""}`;
  if (!shared || sharedKey !== key) {
    shared =
      config.qloo.mode === "live" && config.qloo.apiKey
        ? liveTransport({ apiKey: config.qloo.apiKey, baseUrl: config.qloo.baseUrl, timeoutMs: config.qloo.timeoutMs })
        : mockTransport({ latencyMs: Number(process.env.MOCK_LATENCY_MS ?? 0) });
    sharedKey = key;
  }
  return shared;
}

export function qlooFor(config: AppConfig, onReceipt?: (r: QlooReceipt) => void): Qloo {
  return new Qloo(transportFor(config), onReceipt);
}
