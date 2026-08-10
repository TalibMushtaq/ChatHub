import { doubleCsrf } from "csrf-csrf";

const SESSION_SECRET = process.env.SESSION_SECRET ?? "";

const secrets = SESSION_SECRET.split(",")
  .map((s) => s.trim())
  .filter((s): s is string => s.length > 0);

export const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => secrets,
  getSessionIdentifier: (req) => req.session.id,
  cookieName: "x-csrf-token",
  cookieOptions: {
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  },
  getCsrfTokenFromRequest: (req) =>
    req.headers["x-csrf-token"] as string | undefined,
});
