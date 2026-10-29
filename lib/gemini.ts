import "server-only";

/**
 * Minimal Google Gemini client (REST, no SDK).
 * Get a free key at https://aistudio.google.com/apikey and set GEMINI_API_KEY.
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";

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

/**
 * Asks Gemini for a JSON answer and returns the parsed object.
 * Callers validate the result with Zod — the model's output is never trusted as-is.
 */
export async function geminiJson(system: string, prompt: string, temperature = 0.2): Promise<unknown> {
  const res = await fetch(`${BASE}/models/${geminiModel()}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[gemini]", res.status, data?.error?.message);
    const msg =
      res.status === 429
        ? "Gemini rate limit reached — wait a minute and try again."
        : res.status === 400 || res.status === 403
          ? `Gemini rejected the request: ${data?.error?.message ?? "check GEMINI_API_KEY"}`
          : "Gemini is unavailable right now.";
    throw new GeminiError(msg, res.status === 429 ? 429 : 502);
  }

  const text: string | undefined = data?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? "")
    .join("");
  if (!text) throw new GeminiError("Gemini returned an empty answer.", 502);

  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw new GeminiError("Gemini returned malformed JSON.", 502);
  }
}
