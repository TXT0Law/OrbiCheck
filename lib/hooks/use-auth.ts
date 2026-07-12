"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getUserEmail, isLoggedIn, login, logout } from "@/lib/auth";

const DASHBOARD_ROUTE = "/dashboard";
const LOGIN_ROUTE = "/login";
const DEFAULT_USER_LABEL = "Admin";

export type SessionGuardStatus =
  | "checking"
  | "authenticated"
  | "unauthenticated"
  | "unavailable";

export function useLogin() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const submit = useCallback(
    async (email: string, password: string): Promise<void> => {
      setIsSubmitting(true);
      setErrorMessage(null);
      try {
        await login(email, password);
        router.replace(DASHBOARD_ROUTE);
        router.refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to sign in");
      } finally {
        setIsSubmitting(false);
      }
    },
    [router]
  );

  return { errorMessage, isSubmitting, submit };
}

export function useLogout() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = useCallback(async (): Promise<void> => {
    setIsSubmitting(true);
    try {
      await logout();
    } finally {
      setIsSubmitting(false);
      router.replace(LOGIN_ROUTE);
      router.refresh();
    }
  }, [router]);

  return { isSubmitting, submit };
}

export function useSessionGuard(): SessionGuardStatus {
  const router = useRouter();
  const [status, setStatus] = useState<SessionGuardStatus>("checking");

  useEffect(() => {
    let active = true;

    void isLoggedIn()
      .then((authenticated) => {
        if (!active) {
          return;
        }
        if (authenticated) {
          setStatus("authenticated");
          return;
        }
        setStatus("unauthenticated");
        router.replace(LOGIN_ROUTE);
      })
      .catch(() => {
        if (active) {
          setStatus("unavailable");
        }
      });

    return () => {
      active = false;
    };
  }, [router]);

  return status;
}

export function useUserEmail(): string {
  const [email, setEmail] = useState(DEFAULT_USER_LABEL);

  useEffect(() => {
    setEmail(getUserEmail());
  }, []);

  return email;
}
