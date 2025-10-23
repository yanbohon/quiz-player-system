function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  return trimmed.replace(/\/+$/, "");
}

export const API_CONFIG = {
  // 注意：baseUrl 使用内置默认值，不需要配置环境变量
  // 项目主要使用：tihaiBaseUrl（题海抢题）和 FUSION_API_CONFIG（飞书多维表格）
  baseUrl: normalizeBaseUrl(
    process.env.NEXT_PUBLIC_API_BASE_URL,
    "https://api.ohvfx.com/api"
  ),
  tihaiBaseUrl: normalizeBaseUrl(
    process.env.NEXT_PUBLIC_TIHAI_API_BASE,
    "https://fn.ohvfx.com/quiz-pool/api"
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
