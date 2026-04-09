import { describe, expect, it, vi } from "vitest";

import { fetchOceanStageConfig } from "@/lib/fusionClient";

describe("fetchOceanStageConfig", () => {
  it("accepts roundTimeLimitSeconds when timeLimitSeconds is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            questionCount: 600,
            roundTimeLimitSeconds: 120,
            mode: "团队",
            loadedPresetName: "测试",
            source: "preset",
            updatedAt: "2026-04-08T09:49:20.430Z",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          }
        )
      )
    );

    await expect(fetchOceanStageConfig()).resolves.toEqual({
      questionCount: 600,
      timeLimitSeconds: 120,
      mode: "group",
      loadedPresetName: "测试",
      source: "preset",
      updatedAt: "2026-04-08T09:49:20.430Z",
    });

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/config"), {
      cache: "no-store",
    });
  });
});
