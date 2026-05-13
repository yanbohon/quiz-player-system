import { afterEach, describe, expect, it, vi } from "vitest";

async function loadEnv(metaEnv: Record<string, string | undefined>) {
  vi.stubGlobal("__APP_ENV__", metaEnv);
  vi.resetModules();
  return import("./env");
}

describe("env compatibility helper", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers VITE values and falls back to legacy NEXT_PUBLIC values", async () => {
    const { getPublicEnv } = await loadEnv({
      VITE_MQTT_URL: "wss://vite.example/mqtt",
      NEXT_PUBLIC_MQTT_URL: "wss://next.example/mqtt",
      NEXT_PUBLIC_TIHAI_API_BASE: "https://legacy.example/api",
    });

    expect(getPublicEnv("MQTT_URL")).toBe("wss://vite.example/mqtt");
    expect(getPublicEnv("TIHAI_API_BASE")).toBe("https://legacy.example/api");
    expect(getPublicEnv("MISSING_KEY", "fallback")).toBe("fallback");
  });

  it("normalizes router and asset base paths consistently", async () => {
    const { getBasePath, getViteBase } = await loadEnv({
      VITE_BASE_PATH: "xinsai-player/",
    });

    expect(getBasePath()).toBe("/xinsai-player");
    expect(getViteBase()).toBe("/xinsai-player/");
  });
});
