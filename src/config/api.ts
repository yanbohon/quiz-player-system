function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  return trimmed.replace(/\/+$/, "");
}

export const API_CONFIG = {
  baseUrl: normalizeBaseUrl(
    process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL,
    "https://api.ohvfx.com/api"
  ),
  tihaiBaseUrl: normalizeBaseUrl(
    process.env.NEXT_PUBLIC_TIHAI_API_BASE,
    "https://znbiakwnyaoe.sealosbja.site/api"
  ),
} as const;

export function resolveApiUrl(endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }
  const normalizedEndpoint = endpoint.startsWith("/")
    ? endpoint
    : `/${endpoint}`;
  return `${API_CONFIG.baseUrl}${normalizedEndpoint}`;
}

export function resolveTihaiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_CONFIG.tihaiBaseUrl}${normalizedPath}`;
}
