import axios from "axios";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3100/api",
  withCredentials: true,
});

// tiny-csrf runs on every state-changing method and clears its token cookie
// after each successful request, so each POST/PUT/PATCH/DELETE must first
// fetch a fresh token via GET /csrf-token and echo it back as `_csrf` in the
// request body. Doing both here means every caller can use a plain
// api.get/post/patch/delete with no CSRF boilerplate. The token fetch is a
// GET, which skips this interceptor, so there is no recursion.
api.interceptors.request.use(async (config) => {
  const method = (config.method ?? "get").toLowerCase();
  if (method === "get" || method === "head" || method === "options") {
    return config;
  }

  const { data } = await api.get<{ csrfToken: string }>("/csrf-token");

  const body = config.data;
  if (body && typeof body === "object") {
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      body.append("_csrf", data.csrfToken);
    } else {
      config.data = { ...body, _csrf: data.csrfToken };
    }
  } else {
    config.data = { _csrf: data.csrfToken };
  }

  return config;
});
