import {
  authSessionSchema,
  logoutResponseSchema,
  type AuthSession,
} from "@/shared/schemas/auth";

import { apiClient } from "./client";

export interface LoginCredentials {
  email: string;
  password: string;
}

export async function createSession(
  credentials: LoginCredentials
): Promise<AuthSession> {
  const { data } = await apiClient.post("/auth/login", credentials);
  return authSessionSchema.parse(data);
}

export async function readSession(): Promise<AuthSession> {
  const { data } = await apiClient.get("/auth/session");
  return authSessionSchema.parse(data);
}

export async function deleteSession(): Promise<void> {
  const { data } = await apiClient.post("/auth/logout");
  logoutResponseSchema.parse(data);
}
