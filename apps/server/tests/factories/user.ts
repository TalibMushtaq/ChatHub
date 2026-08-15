import crypto from "node:crypto";

/** Explicit type for the user factory output to avoid circular self-reference (TS2502). */
type UserFactory = {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  bio: string | null;
  gender: string | null;
  dateOfBirth: Date | null;
  passwordHash: string;
  status: string;
  customStatus: string | null;
  showOnlineStatus: boolean;
  showTypingStatus: boolean;
  createdAt: Date;
};

/** Explicit type for the auth-user factory output. */
type AuthUserFactory = Omit<UserFactory, "passwordHash">;

/**
 * Factory for creating user objects in tests.
 *
 * Factories prevent test fragility by centralizing object construction.
 * When the user model changes, update this factory instead of every test.
 *
 * Defaults mirror realistic values. Override any field by passing partial data.
 */
export function createUser(partial: Partial<UserFactory> = {}): UserFactory {
  const id = partial.id ?? crypto.randomUUID();
  const defaults: UserFactory = {
    id,
    email: `user-${id.slice(0, 8)}@example.com`,
    username: `user_${id.slice(0, 8)}`,
    displayName: `User ${id.slice(0, 8)}`,
    avatar: null,
    bio: null,
    gender: null,
    dateOfBirth: null,
    passwordHash: `$argon2id$v=19$m=65536,t=3,p=4$${"A".repeat(22)}$${"B".repeat(43)}`,
    status: "AVAILABLE",
    customStatus: null,
    showOnlineStatus: true,
    showTypingStatus: true,
    createdAt: new Date("2024-01-01T00:00:00Z"),
  };

  return { ...defaults, ...partial };
}

/**
 * Factory for the `AuthUser` subset attached to `req.user` by requireAuth.
 */
export function createAuthUser(
  partial: Partial<AuthUserFactory> = {},
): AuthUserFactory {
  const base = createUser(partial);
  return {
    id: base.id,
    email: base.email,
    username: base.username,
    displayName: base.displayName,
    avatar: base.avatar,
    bio: base.bio,
    gender: base.gender,
    dateOfBirth: base.dateOfBirth,
    status: base.status,
    customStatus: base.customStatus,
    showOnlineStatus: base.showOnlineStatus,
    showTypingStatus: base.showTypingStatus,
    createdAt: base.createdAt,
    ...partial,
  };
}
