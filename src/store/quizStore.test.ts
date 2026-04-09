import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchDatasheetRecordsMock, fetchOceanStageConfigMock } = vi.hoisted(() => ({
  fetchDatasheetRecordsMock: vi.fn(),
  fetchOceanStageConfigMock: vi.fn(),
}));

vi.mock("@/lib/fusionClient", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fusionClient")>("@/lib/fusionClient");
  return {
    ...actual,
    fetchDatasheetRecords: fetchDatasheetRecordsMock,
    fetchOceanStageConfig: fetchOceanStageConfigMock,
  };
});

import { useQuizStore } from "@/store/quizStore";

describe("quizStore refreshScoreRecord", () => {
  beforeEach(() => {
    fetchDatasheetRecordsMock.mockReset();
    fetchOceanStageConfigMock.mockReset();
    useQuizStore.getState().reset();
  });

  it("matches buzzer sprint teams only by team_id when strict matching is requested", async () => {
    fetchDatasheetRecordsMock.mockResolvedValue([
      {
        recordId: "record-school-red",
        fields: {
          School: "red",
          team_id: "blue",
        },
      },
      {
        recordId: "record-team-red",
        fields: {
          team_id: "red",
        },
      },
    ]);

    const match = await useQuizStore.getState().refreshScoreRecord("score-sheet", "red", {
      fieldKeys: ["team_id"],
      allowAnyFieldFallback: false,
    });

    expect(match?.recordId).toBe("record-team-red");
    expect(useQuizStore.getState().scoreRecord?.recordId).toBe("record-team-red");
  });

  it("clears the previous score record when strict team_id matching finds no record", async () => {
    useQuizStore.setState({
      scoreRecord: {
        recordId: "stale-record",
        fields: { team_id: "blue" },
      },
    });
    fetchDatasheetRecordsMock.mockResolvedValue([
      {
        recordId: "record-school-red",
        fields: {
          School: "red",
        },
      },
    ]);

    const match = await useQuizStore.getState().refreshScoreRecord("score-sheet", "red", {
      fieldKeys: ["team_id"],
      allowAnyFieldFallback: false,
    });

    expect(match).toBeUndefined();
    expect(useQuizStore.getState().scoreRecord).toBeUndefined();
  });

  it("stores ocean stage config and replaces the default remaining count", async () => {
    fetchOceanStageConfigMock.mockResolvedValue({
      questionCount: 20,
      timeLimitSeconds: 45,
      mode: "group",
      loadedPresetName: "决赛题包A",
      source: "preset",
      updatedAt: "2026-04-08T08:39:59.033Z",
    });

    const config = await useQuizStore.getState().loadOceanStageConfig();
    const state = useQuizStore.getState();

    expect(config.questionCount).toBe(20);
    expect(state.oceanStageConfig).toMatchObject({
      questionCount: 20,
      timeLimitSeconds: 45,
      mode: "group",
    });
    expect(state.oceanStageConfigStatus).toBe("success");
    expect(state.oceanRemainingCount).toBe(20);
  });

  it("records ocean stage config failures and clears the remaining count", async () => {
    fetchOceanStageConfigMock.mockRejectedValue(new Error("配置接口不可用"));

    await expect(useQuizStore.getState().loadOceanStageConfig()).rejects.toThrow(
      "配置接口不可用"
    );

    const state = useQuizStore.getState();
    expect(state.oceanStageConfig).toBeUndefined();
    expect(state.oceanStageConfigStatus).toBe("error");
    expect(state.oceanStageConfigError).toBe("配置接口不可用");
    expect(state.oceanRemainingCount).toBe(0);
  });
});
