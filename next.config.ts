import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // 优化配置
  compress: true,
  poweredByHeader: false,

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

