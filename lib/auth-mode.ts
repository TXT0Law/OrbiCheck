export function isAuthDevBypassEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_DEV_BYPASS_ENABLED === "true";
}
