import { CSRF_COOKIE, USER_EMAIL_KEY } from "@/lib/auth-constants";
import {
  createSession,
  deleteSession,
  readSession,
} from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import type { AuthSession } from "@/shared/schemas/auth";

const DEFAULT_USER_LABEL = "Admin";

function saveUserEmail(email: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(USER_EMAIL_KEY, email);
  }
}

function clearUserEmail(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(USER_EMAIL_KEY);
  }
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const session = await createSession({ email, password });
  saveUserEmail(session.email);
  return session;
}

export async function logout(): Promise<void> {
  try {
    await deleteSession();
  } finally {
    clearUserEmail();
  }
}

export async function isLoggedIn(): Promise<boolean> {
  try {
    const session = await readSession();
    saveUserEmail(session.email);
    return session.authenticated;
  } catch (error) {
    if (ApiError.isApiError(error) && error.status === 401) {
      clearUserEmail();
      return false;
    }
    throw error;
  }
}

export function getUserEmail(): string {
  if (typeof window === "undefined") {
    return DEFAULT_USER_LABEL;
  }
  return window.localStorage.getItem(USER_EMAIL_KEY) || DEFAULT_USER_LABEL;
}

export function getCsrfToken(): string {
  if (typeof document === "undefined") {
    return "";
  }

  const prefix = `${CSRF_COOKIE}=`;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!cookie) {
    return "";
  }

  try {
    return decodeURIComponent(cookie.slice(prefix.length));
  } catch (error) {
    if (error instanceof URIError) {
      return "";
    }
    throw error;
  }
}