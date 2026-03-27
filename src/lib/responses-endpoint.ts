import { gatewayCall } from "@/lib/openclaw";

// ── Auto-enable OpenResponses endpoint for streaming chat ──
let _responsesEndpointEnsured = false;
let _responsesLastAttempt = 0;
const RESPONSES_RETRY_COOLDOWN_MS = 5 * 60_000;

let _responsesSetupPromise: Promise<void> | null = null;

export function ensureResponsesEndpoint(): void {
  if (_responsesEndpointEnsured) return;
  if (Date.now() - _responsesLastAttempt < RESPONSES_RETRY_COOLDOWN_MS) return;
  _responsesLastAttempt = Date.now();

  _responsesSetupPromise = (async () => {
    try {
      const cfg = await gatewayCall<{
        hash?: string;
        parsed?: Record<string, unknown>;
        config?: Record<string, unknown>;
      }>("config.get", undefined, 8000);
      const root = cfg?.parsed ?? cfg?.config ?? {};
      const gw = (root as Record<string, unknown>)?.gateway as Record<string, unknown> | undefined;
      const http = gw?.http as Record<string, unknown> | undefined;
      const endpoints = http?.endpoints as Record<string, unknown> | undefined;
      const responses = endpoints?.responses as Record<string, unknown> | undefined;
      if (responses?.enabled === true) {
        _responsesEndpointEnsured = true;
        return;
      }

      await gatewayCall(
        "config.patch",
        {
          raw: JSON.stringify({
            gateway: { http: { endpoints: { responses: { enabled: true } } } },
          }),
          baseHash: String(cfg?.hash || ""),
          restartDelayMs: 3000,
        },
        10000,
      );
      _responsesEndpointEnsured = true;
    } catch {
      // Non-fatal
    } finally {
      _responsesSetupPromise = null;
    }
  })();
}

export async function waitForResponsesEndpoint(): Promise<void> {
  if (_responsesSetupPromise) {
    await _responsesSetupPromise;
  }
}

export function triggerResponsesEndpointSetup(): void {
  ensureResponsesEndpoint();
}
