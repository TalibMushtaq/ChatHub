import webpush from "web-push";

// ---------------------------------------------------------------------------
// VAPID configuration for Web Push (RFC 8292).
//
// Loaded once at import time. The server only initializes web-push when the
// three VAPID vars are present, so a local/dev instance without them keeps
// working — message sends simply skip the push side-effect (see the push
// service, which checks isWebPushConfigured() before doing anything).
// ---------------------------------------------------------------------------

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT;

export function isWebPushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);
}

/** Public VAPID key the browser needs to subscribe (NEXT_PUBLIC_* in web). */
export function getVapidPublicKey(): string | null {
  return VAPID_PUBLIC_KEY ?? null;
}

// The public key is safe to expose (it's shipped to every browser anyway);
// the private key never leaves the server.
if (isWebPushConfigured()) {
  webpush.setVapidDetails(
    VAPID_SUBJECT as string,
    VAPID_PUBLIC_KEY as string,
    VAPID_PRIVATE_KEY as string,
  );
}
