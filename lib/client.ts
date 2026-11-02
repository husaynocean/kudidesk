/** POSTs JSON from the browser with a time limit, so a stuck request never leaves a button spinning. */
export async function postJson<T = Record<string, unknown>>(
  url: string,
  body: unknown,
  timeoutMs = 90_000,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if ((err as Error).name === "TimeoutError") {
      throw new Error("KudiDesk took too long to answer — check the terminal running the app, then try again.");
    }
    throw new Error("Couldn't reach KudiDesk — is the app still running?");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}
