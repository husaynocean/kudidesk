import "server-only";
import dns from "node:dns";

// Some home/mobile networks advertise IPv6 but can't route it, which makes requests hang.
// Prefer IPv4 so calls to Google don't sit there until they time out.
dns.setDefaultResultOrder("ipv4first");

/**
 * Minimal Google Gemini client (REST, no SDK).
 * Get a free key at https://aistudio.google.com/apikey and set GEMINI_API_KEY.
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";

const TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 45_000;

export function hasGemini() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function geminiModel() {
  // "gemini-flash-latest" always points at Google's current Flash model.
  return process.env.GEMINI_MODEL || "gemini-flash-latest";
}

export class GeminiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Models to try in order: GEMINI_MODEL first, then lighter fallbacks for when it's overloaded. */
export function geminiModels() {
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-flash-lite-latest,gemini-2.5-flash")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([geminiModel(), ...fallbacks])];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The last model that answered, shown on /api/health. */
let lastModel: string | null = null;
export const lastGeminiModel = () => lastModel;

/**
 * Asks Gemini for a JSON answer and returns the parsed object.
 * Busy (503/500), rate-limited (429) or missing (404) models are retried and then
 * swapped for the next fallback model; key problems (400/401/403) stop straight away.
 * Callers validate the result with Zod — the model's output is never trusted as-is.
 */
export async function geminiJson(system: string, prompt: string, temperature = 0.2): Promise<unknown> {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature },
  });
  const key = process.env.GEMINI_API_KEY!.trim();
  let keyInQuery = false;

  const call = (model: string) => {
    const url = `${BASE}/models/${model}:generateContent`;
    return fetch(keyInQuery ? `${url}?key=${encodeURIComponent(key)}` : url, {
      method: "POST",
      headers: keyInQuery
        ? { "Content-Type": "application/json" }
        : { "Content-Type": "application/json", "x-goog-api-key": key },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  };

  let lastError = new GeminiError("Gemini is unavailable right now.", 502);

  for (const model of geminiModels()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let res: Response;
      try {
        res = await call(model);
        // Some key formats are only accepted as a ?key= parameter — switch once and keep using it.
        if (res.status === 401 && !keyInQuery) {
          keyInQuery = true;
          res = await call(model);
        }
      } catch (err) {
        // Network-level failure (no internet, VPN/firewall, DNS, timeout, bad characters in the key).
        const e = err as Error & { cause?: { code?: string; message?: string } };
        const detail =
          e.name === "TimeoutError"
            ? `timed out after ${TIMEOUT_MS / 1000}s`
            : (e.cause?.code ?? e.cause?.message ?? e.message);
        console.error("[gemini] request failed:", model, e.message, e.cause ?? "");
        throw new GeminiError(`Couldn't reach Gemini (${detail}).`, 502);
      }

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const text: string | undefined = data?.candidates?.[0]?.content?.parts
          ?.map((p: { text?: string }) => p.text ?? "")
          .join("");
        if (!text) {
          lastError = new GeminiError("Gemini returned an empty answer.", 502);
          break; // try the next model
        }
        try {
          const parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
          lastModel = model;
          return parsed;
        } catch {
          lastError = new GeminiError("Gemini returned malformed JSON.", 502);
          break;
        }
      }

      const reason = data?.error?.message ?? res.statusText;
      console.error("[gemini]", model, res.status, reason);
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        throw new GeminiError(`Gemini rejected the key or request: ${reason}`, 502);
      }
      if (res.status === 404) {
        lastError = new GeminiError(
          `Gemini model "${model}" not found — set GEMINI_MODEL to one listed in AI Studio.`,
          502,
        );
        break;
      }
      if (res.status === 429) {
        lastError = new GeminiError("Gemini rate limit reached — wait a minute and try again.", 429);
        break; // each model has its own free quota, so the next one may still work
      }
      lastError = new GeminiError(`Gemini is busy right now (${res.status}) — try again in a moment.`, 502);
      if (attempt === 0) await sleep(1200);
    }
  }
  throw lastError;
}

/** Tiny round-trip used by /api/health?check=ai to test the connection and key. */
export async function pingGemini(): Promise<{ ok: boolean; ms: number; detail: string }> {
  const start = Date.now();
  try {
    await geminiJson('Reply with {"ok":true}', "ping", 0);
    return { ok: true, ms: Date.now() - start, detail: `Gemini answered ✔ (model: ${lastModel})` };
  } catch (err) {
    return { ok: false, ms: Date.now() - start, detail: (err as Error).message };
  }
}
