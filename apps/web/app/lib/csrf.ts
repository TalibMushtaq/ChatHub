import { api } from "./api";

// tiny-csrf on the server clears the csrfToken cookie after every successful
// state-changing request, so each mutation must fetch a fresh token first.
// The token is echoed back as `_csrf` in the request body (the only field
// tiny-csrf v1.1.6 validates against the signed cookie).

export async function getCsrfToken(): Promise<string> {
  const { data } = await api.get("/api/csrf-token");
  return data.csrfToken as string;
}

export async function postCsrf<T = unknown>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const token = await getCsrfToken();
  const { data } = await api.post(path, { ...body, _csrf: token });
  return data as T;
}
