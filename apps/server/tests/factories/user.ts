import crypto from "node:crypto";

/**
 * Factory for creating user objects in tests.
 *
 * Factories prevent test fragility by centralizing object construction.
 * When the user model changes, update this factory instead of every test.
 *
 * Defaults mirror realistic values. Override any field by passing partial data.
 */
export function createUser(partial?: Partial<ReturnType<typeof createUser>>) {
  const id = partial?.id ?? crypto.randomUUID();
  const defaults = {
    id,
    email: `user-${id.slice(0, 8)}@example.com`,
    username: `user_${id.slice(0, 8)}`,
    displayname: `User ${id.slice(0, 8)}`,
    avatar: null as string | null,
    passwordHash: `$argon2id$v=19$m=65536,t=3,p=4$${"A".repeat(22)}$${"B".repeat(43)}`,
    createdAt: new Date("2024-01-01T00:00:00Z"),
  };

  return { ...defaults, ...partial };
}

/**
 * Factory for the `AuthUser` subset attached to `req.user` by requireAuth.
 */
export function createAuthUser(partial?: Partial<ReturnType<typeof createAuthUser>>) {
  const base = createUser(partial);
  return {
    id: base.id,
    email: base.email,
    username: base.username,
    displayname: base.displayname,
    avatar: base.avatar,
    createdAt: base.createdAt,
    ...partial,
  };
}
