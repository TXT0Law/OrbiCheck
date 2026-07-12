import { z } from "zod";

export const authSessionSchema = z.object({
  authenticated: z.boolean(),
  email: z.string().email(),
});

export const logoutResponseSchema = z.object({
  ok: z.boolean(),
});

export type AuthSession = z.infer<typeof authSessionSchema>;
