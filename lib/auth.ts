const LOCAL_MODE_EMAIL = "Local Mode";

export async function login(email: string, password: string) {
  void email;
  void password;
  return;
}

export async function logout() {
  return;
}

export async function isLoggedIn() {
  return true;
}

export function getUserEmail() {
  return LOCAL_MODE_EMAIL;
}

export function getCsrfToken() {
  return "";
}