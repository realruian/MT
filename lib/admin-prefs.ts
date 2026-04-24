const PREFIX = "admin:lastCategory:";

export function readLastCategory(
  scope: "html" | "psd" | "venue",
  allowed: readonly string[],
): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(PREFIX + scope);
    if (v && allowed.includes(v)) return v;
  } catch {
    /* SecurityError / disabled storage — ignore */
  }
  return null;
}

export function writeLastCategory(
  scope: "html" | "psd" | "venue",
  value: string,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + scope, value);
  } catch {
    /* ignore */
  }
}
