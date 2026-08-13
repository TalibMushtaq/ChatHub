import { z } from "zod";

const emailSchema = z.email().trim();

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(
    /^[a-zA-Z0-9_]+$/,
    "Username can only contain letters, numbers, and _",
  );

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters");

// Display name is optional everywhere (signup and profile settings) and is
// capped at 40 characters so it remains readable in headers, lists, and avatars.
const displayNameSchema = z
  .string()
  .trim()
  .max(40, "Display name must be at most 40 characters")
  .optional()
  .nullable();

const bioSchema = z
  .string()
  .max(160, "Bio must be at most 160 characters")
  .optional()
  .nullable();

const genderSchema = z
  .enum(["MALE", "FEMALE", "NON_BINARY", "OTHER", "PREFER_NOT_TO_SAY"])
  .optional()
  .nullable();

// Store date of birth as a Date but accept an ISO date string from JSON.
// The max constraint rejects future dates; no minimum age is enforced.
const dateOfBirthSchema = z.coerce
  .date()
  .max(new Date(), "Date of birth cannot be in the future")
  .optional()
  .nullable();

const avatarSchema = z.url().trim().optional().nullable();

const loginWithEmail = z.object({
  email: emailSchema,
  password: passwordSchema,
});

const loginWithUsername = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export const searchUsersQuerySchema = z.object({
  query: z.string().min(2).max(100).trim(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  cursor: z.string().uuid().optional(),
});

export const userIdParamSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Recovery code schemas
// ---------------------------------------------------------------------------

/**
 * Recovery code format: RC_{codeId}.{secret}
 * codeId: 6 chars from the allowed alphabet
 * secret: 3 groups of 4 chars separated by hyphens
 * Example: RC_4A7F8C.JQ8K-H4XT-MP2L
 */
const recoveryCodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const recoveryCodeRegex = new RegExp(
  `^RC_[${recoveryCodeAlphabet}]{6}\\.([${recoveryCodeAlphabet}]{4}-){2}[${recoveryCodeAlphabet}]{4}$`,
);

export const forgotPasswordSchema = z.object({
  username: z.string().min(1).trim(),
  recoveryCode: z
    .string()
    .regex(recoveryCodeRegex, "Invalid recovery code format"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"),
});

export const regenerateRecoveryCodesSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
});

export const checkUsernameSchema = z.object({
  username: usernameSchema,
});

export const userZod = {
  email: emailSchema,
  username: usernameSchema,
  displayName: displayNameSchema,
  bio: bioSchema,
  gender: genderSchema,
  dateOfBirth: dateOfBirthSchema,
  password: passwordSchema,
  avatar: avatarSchema.optional(),

  // Signup is intentionally minimal: email, username, password. Everything else
  // (display name, bio, gender, date of birth) is completed later in settings.
  signup: z.object({
    email: emailSchema,
    username: usernameSchema,
    password: passwordSchema,
    displayName: displayNameSchema,
  }),

  login: z.union([loginWithEmail, loginWithUsername]),

  // Username is intentionally absent: it is chosen during onboarding and is
  // immutable after account creation. `strict()` ensures any extra field
  // (including a sneaky username) fails validation before reaching the route.
  updateMe: z
    .object({
      displayName: displayNameSchema,
      bio: bioSchema,
      gender: genderSchema,
      dateOfBirth: dateOfBirthSchema,
      currentPassword: z.string().min(1).optional(),
      newPassword: passwordSchema.optional(),
      // The shared API client injects `_csrf` into every mutating request body,
      // so the profile-update schema must accept it while remaining strict.
      _csrf: z.string().optional(),
    })
    .strict()
    .refine(
      (data) => {
        const wantsChange =
          data.currentPassword !== undefined || data.newPassword !== undefined;

        if (!wantsChange) return true;

        return !!data.currentPassword && !!data.newPassword;
      },
      {
        message:
          "To change password, provide both currentPassword and newPassword",
      },
    ),
};
