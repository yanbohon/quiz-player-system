import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchDatasheetRecordsMock, fetchOceanStageConfigMock, patchDatasheetRecordsMock } = vi.hoisted(() => ({
  fetchDatasheetRecordsMock: vi.fn(),
  fetchOceanStageConfigMock: vi.fn(),
  patchDatasheetRecordsMock: vi.fn(),
}));

vi.mock("@/lib/fusionClient", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fusionClient")>("@/lib/fusionClient");
  return {
    ...actual,
    fetchDatasheetRecords: fetchDatasheetRecordsMock,
    fetchOceanStageConfig: fetchOceanStageConfigMock,
    patchDatasheetRecords: patchDatasheetRecordsMock,
  };
});

import { useQuizStore } from "@/store/quizStore";

describe("quizStore refreshScoreRecord", () => {
  beforeEach(() => {
    fetchDatasheetRecordsMock.mockReset();
    fetchOceanStageConfigMock.mockReset();
    patchDatasheetRecordsMock.mockReset();
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

  it("updates question raw fields in memory", () => {
    useQuizStore.setState({
      questions: [
        {
          id: "q1",
          type: "multiple",
          content: "question",
          options: [],
          answer: [],
          raw: { owner: "1001" },
          source: "default",
        },
      ],
    });

    useQuizStore.getState().setQuestionFieldValue("q1", "challengeTarget", "1002");

    expect(useQuizStore.getState().questions[0]?.raw).toMatchObject({
      owner: "1001",
      challengeTarget: "1002",
    });
  });

  it("increments a score field for a matched identifier", async () => {
    fetchDatasheetRecordsMock.mockResolvedValue([
      {
        recordId: "score-record-1",
        fields: {
          用户ID: "1001",
          challengeScore: 20,
        },
      },
    ]);
    patchDatasheetRecordsMock.mockResolvedValue(undefined);

    const nextValue = await useQuizStore.getState().incrementScoreFieldByIdentifier({
      datasheetId: "score-sheet",
      identifier: "1001",
      fieldKey: "challengeScore",
      delta: 20,
    });

    expect(nextValue).toBe(40);
    expect(patchDatasheetRecordsMock).toHaveBeenCalledWith("score-sheet", {
      records: [
        {
          recordId: "score-record-1",
          fields: {
            challengeScore: 40,
          },
        },
      ],
    });
  });

  it("reuses the event-level general sheet when a stage does not declare its own team directory", async () => {
    fetchDatasheetRecordsMock.mockResolvedValue([
      {
        recordId: "rec-school-1",
        fields: {
          用户ID: "1001",
          名称: "1.上海理工大学测试",
        },
      },
      {
        recordId: "rec-school-2",
        fields: {
          用户ID: "1002",
          名称: "2.上海政法学院",
        },
      },
    ]);

    useQuizStore.setState({
      stages: [
        {
          order: 2,
          stageId: "2",
          recordId: "record-stage-2",
          name: "有问必答（挑战版）",
          displayName: "有问必答(挑战题)",
          kind: "standard",
          rawFields: {},
        },
      ],
      teamDirectorySheetId: "school-sheet",
      teamProfiles: {
        stale: {
          recordId: "rec-stale",
          identifier: "stale",
          fields: { 用户ID: "stale", 名称: "过期数据" },
        },
      },
    });

    await useQuizStore.getState().activateStageById("2", "1001");

    expect(fetchDatasheetRecordsMock).toHaveBeenCalledWith("school-sheet");
    expect(useQuizStore.getState().teamProfiles["1001"]?.displayName).toBe(
      "1.上海理工大学测试"
    );
    expect(useQuizStore.getState().teamProfiles["1002"]?.displayName).toBe(
      "2.上海政法学院"
    );
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
