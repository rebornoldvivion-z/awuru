/** Server-only PostgREST helper. Never import from Command Center or /api/bundle. */

export type RestInit = RequestInit & { query?: string };

export function publicUrl(raw: string): string {
  return raw.replace(/\/$/, "");
}

export async function supabaseRest(
  url: string,
  key: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${publicUrl(url)}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
}

export async function supabaseJson<T>(
  url: string,
  key: string,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: T | null; text: string }> {
  const res = await supabaseRest(url, key, path, init);
  const text = await res.text();
  let data: T | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = null;
    }
  }
  return { ok: res.ok, status: res.status, data, text };
}
