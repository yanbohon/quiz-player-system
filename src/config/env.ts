type EnvMap = Record<string, string | boolean | undefined>;

declare global {
  // Test-only injection point. Real browser builds use import.meta.env.
  // eslint-disable-next-line no-var
  var __APP_ENV__: EnvMap | undefined;
}

const metaEnv = (import.meta as ImportMeta & { env?: EnvMap }).env ?? {};

function readRawEnv(key: string): string | undefined {
  const injected = globalThis.__APP_ENV__?.[key];
  const value = injected ?? metaEnv[key];
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return typeof value === "string" ? value : undefined;
}

export function getPublicEnv(
  name: string,
  fallback?: string
): string | undefined {
  const viteValue = readRawEnv(`VITE_${name}`)?.trim();
  if (viteValue) return viteValue;

  const legacyValue = readRawEnv(`NEXT_PUBLIC_${name}`)?.trim();
  if (legacyValue) return legacyValue;

  return fallback;
}

export function isPublicEnvEnabled(name: string, fallback = false): boolean {
  const value = getPublicEnv(name);
  if (value === undefined) return fallback;
  return value !== "false" && value !== "0";
}

export function normalizeBasePath(value?: string): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

export function getBasePath(): string {
  return normalizeBasePath(getPublicEnv("BASE_PATH"));
}

export function getViteBase(): string {
  const basePath = getBasePath();
  return basePath ? `${basePath}/` : "/";
}
