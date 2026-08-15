import { z } from "zod";

// Payload sent by the browser when registering a Web Push subscription
// (PushSubscription.toJSON()). p256dh/auth are the base64url key material
// the push service uses to encrypt notifications.
export const pushSubscribeSchema = z.object({
  endpoint: z.url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

// Unsubscribe only needs the endpoint — it uniquely identifies the
// subscription, so the client doesn't have to re-send the key material.
export const pushUnsubscribeSchema = z.object({
  endpoint: z.url(),
});
