import os from "os";
import type { NextConfig } from "next";

function resolveAllowedDevOrigins(): string[] {
  const port = Number(process.env.PORT ?? process.env.NEXT_DEV_PORT ?? 3000);
  const origins = new Set<string>([
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
  ]);

  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (!address || address.internal || address.family !== "IPv4") continue;
      origins.add(`http://${address.address}:${port}`);
    }
  }

  const extraOrigins = process.env.NEXT_DEV_ALLOWED_ORIGINS;
  if (extraOrigins) {
    for (const origin of extraOrigins
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)) {
      origins.add(origin);
    }
  }

  return Array.from(origins);
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: resolveAllowedDevOrigins(),

  // 设置与云托管一致的触发路径（从环境变量读取，默认为空）
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',

  // 优化配置
  compress: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.ohvfx.com",
      },
    ],
  },

  // 启用 standalone 输出模式（用于容器部署）
  output: "standalone",

  // Webpack 配置（用于 MQTT.js）
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // 为 MQTT.js 配置 fallback
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        dns: false,
      };
    }
    return config;
  },
};

export default nextConfig;
