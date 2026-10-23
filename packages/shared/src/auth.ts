import { z } from 'zod';

// bcrypt ignores everything after 72 bytes, so longer passwords would give a false sense of strength.
const PASSWORD_MAX_BYTES = 72;

const emailSchema = z.email().trim().toLowerCase().max(254);

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: emailSchema,
  password: z
    .string()
    .min(8)
    .refine((password) => new TextEncoder().encode(password).length <= PASSWORD_MAX_BYTES, {
      message: `Password must be at most ${PASSWORD_MAX_BYTES} bytes`,
    }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const publicUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;
