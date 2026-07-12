import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isAuthDevBypassEnabled } from "@/lib/auth-mode";

export default function LoginPage() {
  if (isAuthDevBypassEnabled()) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
            OrbiCheck
          </p>
          <CardTitle className="text-2xl font-semibold">Sign in</CardTitle>
          <p className="text-sm text-muted-foreground">
            Use the administrator credentials configured on the server.
          </p>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}