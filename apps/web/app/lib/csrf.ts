import { api } from "./api";

// tiny-csrf on the server clears the csrfToken cookie after every successful
// state-changing request. The shared `api` instance's request interceptor
// (see lib/api.ts) already fetches a fresh token and echoes it as `_csrf` on
// every non-GET call, so this helper is a thin typed wrapper for callers that
// want the parsed `{ ok: true, ... }` envelope back.

export async function postCsrf<T = unknown>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data } = await api.post(path, body);
  return data as T;
}
