import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MQTT_TOPICS } from "@/config/control";
import { ApiError } from "@/lib/api/client";
import type { OceanStageConfig } from "@/lib/fusionClient";
import type { StageConfig } from "@/store/quizStore";
import type { OceanGroupId, OceanPlayMode } from "@/features/quiz/oceanGroup";
import { resolveModeForStage, useControlCommands } from "./useControlCommands";

const testState = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastWarnMock: vi.fn(),
  toastErrorMock: vi.fn(),
  dialogOpenMock: vi.fn(),
  mqttPublishMock: vi.fn(),
  mqttIsConnectedMock: vi.fn(() => true),
  subscribeMock: vi.fn(),
  loadEventsMock: vi.fn(async () => []),
  selectEventByOrdinalMock: vi.fn(async () => []),
  activateStageByIdMock: vi.fn(async () => {}),
  grabNextQuestionMock: vi.fn(async () => undefined),
  logCommandMock: vi.fn(),
  setCurrentQuestionIndexMock: vi.fn(),
  resetQuizStoreMock: vi.fn(),
  fetchWaitingRankingsMock: vi.fn(async () => {}),
  resetWaitingTicketViewMock: vi.fn(),
  setOceanPlayModeMock: vi.fn(),
  setOceanGroupIdMock: vi.fn(),
  setOceanGroupLockedMock: vi.fn(),
  setSprintTeamIdMock: vi.fn(),
  setSprintTeamLockedMock: vi.fn(),
  setSprintTeamStageIdMock: vi.fn(),
  clearSprintTeamSelectionMock: vi.fn(),
  setMqttConnectedMock: vi.fn(),
  appStoreState: undefined as
    | {
        user: { id: string } | null;
        oceanPlayMode: OceanPlayMode | null;
        oceanGroupId: OceanGroupId | null;
        sprintTeamId: OceanGroupId | null;
        sprintTeamLocked: boolean;
        sprintTeamStageId: string | null;
        setOceanPlayMode: ReturnType<typeof vi.fn>;
        setOceanGroupId: ReturnType<typeof vi.fn>;
        setOceanGroupLocked: ReturnType<typeof vi.fn>;
        setSprintTeamId: ReturnType<typeof vi.fn>;
        setSprintTeamLocked: ReturnType<typeof vi.fn>;
        setSprintTeamStageId: ReturnType<typeof vi.fn>;
        clearSprintTeamSelection: ReturnType<typeof vi.fn>;
      }
    | undefined,
  appStoreStaticState: undefined as
    | {
        setMqttConnected: ReturnType<typeof vi.fn>;
      }
    | undefined,
  quizStoreState: undefined as
    | {
        events: Array<{ id: string }>;
        loadEvents: ReturnType<typeof vi.fn>;
        selectEventByOrdinal: ReturnType<typeof vi.fn>;
        activateStageById: ReturnType<typeof vi.fn>;
        grabNextQuestion: ReturnType<typeof vi.fn>;
        logCommand: ReturnType<typeof vi.fn>;
        currentStage?: StageConfig;
        oceanStageConfig?: OceanStageConfig;
        oceanStageConfigStatus: "idle" | "loading" | "success" | "error";
        oceanStageConfigError?: string;
        waitingForStageStart: boolean;
        setCurrentQuestionIndex: ReturnType<typeof vi.fn>;
        reset: ReturnType<typeof vi.fn>;
        fetchWaitingRankings: ReturnType<typeof vi.fn>;
        resetWaitingTicketView: ReturnType<typeof vi.fn>;
      }
    | undefined,
}));

let appStoreState: {
  user: { id: string } | null;
  oceanPlayMode: OceanPlayMode | null;
  oceanGroupId: OceanGroupId | null;
  sprintTeamId: OceanGroupId | null;
  sprintTeamLocked: boolean;
  sprintTeamStageId: string | null;
  setOceanPlayMode: typeof testState.setOceanPlayModeMock;
  setOceanGroupId: typeof testState.setOceanGroupIdMock;
  setOceanGroupLocked: typeof testState.setOceanGroupLockedMock;
  setSprintTeamId: typeof testState.setSprintTeamIdMock;
  setSprintTeamLocked: typeof testState.setSprintTeamLockedMock;
  setSprintTeamStageId: typeof testState.setSprintTeamStageIdMock;
  clearSprintTeamSelection: typeof testState.clearSprintTeamSelectionMock;
};

let appStoreStaticState: {
  setMqttConnected: typeof testState.setMqttConnectedMock;
};

let quizStoreState: {
  events: Array<{ id: string }>;
  loadEvents: typeof testState.loadEventsMock;
  selectEventByOrdinal: typeof testState.selectEventByOrdinalMock;
  activateStageById: typeof testState.activateStageByIdMock;
  grabNextQuestion: typeof testState.grabNextQuestionMock;
  logCommand: typeof testState.logCommandMock;
  currentStage?: StageConfig;
  oceanStageConfig?: OceanStageConfig;
  oceanStageConfigStatus: "idle" | "loading" | "success" | "error";
  oceanStageConfigError?: string;
  waitingForStageStart: boolean;
  setCurrentQuestionIndex: typeof testState.setCurrentQuestionIndexMock;
  reset: typeof testState.resetQuizStoreMock;
  fetchWaitingRankings: typeof testState.fetchWaitingRankingsMock;
  resetWaitingTicketView: typeof testState.resetWaitingTicketViewMock;
};

vi.mock("@/lib/router", () => ({
  useAppNavigate: () => ({
    push: testState.pushMock,
  }),
  useAppPathname: () => "/quiz",
  useAppSearchParams: () => ({
    get: () => null,
  }),
}));

vi.mock("@/lib/arco", () => ({
  Toast: {
    success: testState.toastSuccessMock,
    warn: testState.toastWarnMock,
    error: testState.toastErrorMock,
  },
  Dialog: {
    open: testState.dialogOpenMock,
  },
}));

vi.mock("@/lib/mqtt/hooks", () => ({
  useMqtt: () => ({
    isConnected: true,
    error: null,
    subscribe: testState.subscribeMock,
  }),
}));

vi.mock("@/lib/mqtt/client", () => ({
  mqttService: {
    publish: testState.mqttPublishMock,
    isConnected: testState.mqttIsConnectedMock,
  },
}));

vi.mock("@/store/useAppStore", () => {
  const useAppStoreMock = vi.fn((selector: (state: typeof appStoreState) => unknown) =>
    selector(testState.appStoreState as typeof appStoreState)
  );
  Object.assign(useAppStoreMock, {
    getState: () => testState.appStoreStaticState,
  });
  return {
    useAppStore: useAppStoreMock,
  };
});

vi.mock("@/store/quizStore", () => {
  const useQuizStoreMock = vi.fn((selector: (state: typeof quizStoreState) => unknown) =>
    selector(testState.quizStoreState as typeof quizStoreState)
  );
  Object.assign(useQuizStoreMock, {
    getState: () => testState.quizStoreState,
  });
  return {
    RANK_STAGE_MISSING_ERROR: "rank-stage-missing",
    useQuizStore: useQuizStoreMock,
  };
});

function createStage(overrides: Partial<StageConfig> = {}): StageConfig {
  return {
    order: 1,
    stageId: "stage-1",
    recordId: "record-1",
    name: "有问必答",
    displayName: "有问必答",
    kind: "standard",
    rawFields: {},
    ...overrides,
  };
}

describe("resolveModeForStage", () => {
  it("resolves mode from raw field aliases and array values", () => {
    expect(
      resolveModeForStage(
        createStage({
          rawFields: {
            模式: ["忽略", "争分夺秒"],
          },
        })
      )
    ).toBe("speed-run");

    expect(
      resolveModeForStage(
        createStage({
          rawFields: {
            modeId: "ultimatepk",
          },
        })
      )
    ).toBe("ultimate-pk");

    expect(
      resolveModeForStage(
        createStage({
          rawFields: {
            modeId: "抢答冲刺",
          },
        })
      )
    ).toBe("buzzer-sprint");

    expect(
      resolveModeForStage(
        createStage({
          rawFields: {
            modeId: "有问必答挑战题",
          },
        })
      )
    ).toBe("qa-challenge");
  });

  it("falls back to stage names and stage kind when raw fields are absent", () => {
    expect(
      resolveModeForStage(
        createStage({
          name: "一站到底（初中组）",
          displayName: "一站到底（初中组）",
        })
      )
    ).toBe("last-stand-group");

    expect(
      resolveModeForStage(
        createStage({
          name: "",
          displayName: "",
          kind: "grab",
        })
      )
    ).toBe("ocean-adventure");

    expect(
      resolveModeForStage(
        createStage({
          name: "未知环节",
          displayName: "未知环节",
          kind: "standard",
        })
      )
    ).toBe("qa");

    expect(
      resolveModeForStage(
        createStage({
          name: "抢答冲刺",
          displayName: "抢答冲刺",
          kind: "standard",
        })
      )
    ).toBe("buzzer-sprint");
  });
});

describe("useControlCommands", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    appStoreState = {
      user: { id: "user-1" },
      oceanPlayMode: null,
      oceanGroupId: null,
      sprintTeamId: null,
      sprintTeamLocked: false,
      sprintTeamStageId: null,
      setOceanPlayMode: testState.setOceanPlayModeMock,
      setOceanGroupId: testState.setOceanGroupIdMock,
      setOceanGroupLocked: testState.setOceanGroupLockedMock,
      setSprintTeamId: testState.setSprintTeamIdMock,
      setSprintTeamLocked: testState.setSprintTeamLockedMock,
      setSprintTeamStageId: testState.setSprintTeamStageIdMock,
      clearSprintTeamSelection: testState.clearSprintTeamSelectionMock,
    };
    testState.appStoreState = appStoreState;

    appStoreStaticState = {
      setMqttConnected: testState.setMqttConnectedMock,
    };
    testState.appStoreStaticState = appStoreStaticState;

    quizStoreState = {
      events: [{ id: "event-1" }],
      loadEvents: testState.loadEventsMock,
      selectEventByOrdinal: testState.selectEventByOrdinalMock,
      activateStageById: testState.activateStageByIdMock,
      grabNextQuestion: testState.grabNextQuestionMock,
      logCommand: testState.logCommandMock,
      currentStage: createStage({
        kind: "grab",
        name: "题海遨游",
        displayName: "题海遨游",
      }),
      oceanStageConfig: undefined,
      oceanStageConfigStatus: "idle",
      oceanStageConfigError: undefined,
      waitingForStageStart: true,
      setCurrentQuestionIndex: testState.setCurrentQuestionIndexMock,
      reset: testState.resetQuizStoreMock,
      fetchWaitingRankings: testState.fetchWaitingRankingsMock,
      resetWaitingTicketView: testState.resetWaitingTicketViewMock,
    };
    testState.quizStoreState = quizStoreState;

    testState.subscribeMock.mockImplementation(
      (
        _topic: string,
        _callback: (message: string) => void,
        _options?: { onSuccess?: () => void }
      ) => vi.fn()
    );

    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        replace: testState.replaceMock,
      },
    });
  });

  it("subscribes to the command topic and selects the requested question", async () => {
    let commandHandler: ((message: string) => void) | undefined;
    testState.subscribeMock.mockImplementation((topic: string, callback: (message: string) => void) => {
      if (topic === MQTT_TOPICS.command) {
        commandHandler = callback;
      }
      return vi.fn();
    });

    renderHook(() => useControlCommands(true, "client-1"));

    await waitFor(() => {
      expect(testState.subscribeMock).toHaveBeenCalled();
    });

    expect(commandHandler).toBeTypeOf("function");

    commandHandler?.("question 3");

    await waitFor(() => {
      expect(testState.logCommandMock).toHaveBeenCalledWith("question 3");
      expect(testState.setCurrentQuestionIndexMock).toHaveBeenCalledWith(2);
    });
  });

  it("resets quiz state and redirects to waiting for refresh commands", async () => {
    let commandHandler: ((message: string) => void) | undefined;
    testState.subscribeMock.mockImplementation((topic: string, callback: (message: string) => void) => {
      if (topic === MQTT_TOPICS.command) {
        commandHandler = callback;
      }
      return vi.fn();
    });

    renderHook(() => useControlCommands(true, "client-1"));

    await waitFor(() => {
      expect(commandHandler).toBeTypeOf("function");
    });

    commandHandler?.("refresh");

    await waitFor(() => {
      expect(testState.resetQuizStoreMock).toHaveBeenCalledTimes(1);
      expect(testState.setMqttConnectedMock).toHaveBeenCalledWith(false);
      expect(testState.toastSuccessMock).toHaveBeenCalledWith("选手端已重置");
      expect(testState.replaceMock).toHaveBeenCalledWith("/waiting");
    });
  });

  it("resets the waiting ticket view and routes home commands to the waiting page", async () => {
    let commandHandler: ((message: string) => void) | undefined;
    testState.subscribeMock.mockImplementation((topic: string, callback: (message: string) => void) => {
      if (topic === MQTT_TOPICS.command) {
        commandHandler = callback;
      }
      return vi.fn();
    });

    renderHook(() => useControlCommands(true, "client-1"));

    await waitFor(() => {
      expect(commandHandler).toBeTypeOf("function");
    });

    commandHandler?.("home");

    await waitFor(() => {
      expect(testState.resetWaitingTicketViewMock).toHaveBeenCalledTimes(1);
      expect(testState.pushMock).toHaveBeenCalledWith("/waiting");
    });
  });

  it("fetches rankings and routes to waiting for rank commands", async () => {
    let commandHandler: ((message: string) => void) | undefined;
    testState.subscribeMock.mockImplementation((topic: string, callback: (message: string) => void) => {
      if (topic === MQTT_TOPICS.command) {
        commandHandler = callback;
      }
      return vi.fn();
    });

    renderHook(() => useControlCommands(true, "client-1"));

    await waitFor(() => {
      expect(commandHandler).toBeTypeOf("function");
    });

    commandHandler?.("rank");

    await waitFor(() => {
      expect(testState.fetchWaitingRankingsMock).toHaveBeenCalledTimes(1);
      expect(testState.pushMock).toHaveBeenCalledWith("/waiting");
    });
  });

  it("warns when rank data cannot be loaded because no rank stage is available", async () => {
    let commandHandler: ((message: string) => void) | undefined;
    testState.fetchWaitingRankingsMock.mockRejectedValueOnce(new Error("rank-stage-missing"));
    testState.subscribeMock.mockImplementation((topic: string, callback: (message: string) => void) => {
      if (topic === MQTT_TOPICS.command) {
        commandHandler = callback;
      }
      return vi.fn();
    });

    renderHook(() => useControlCommands(true, "client-1"));

    await waitFor(() => {
      expect(commandHandler).toBeTypeOf("function");
    });

    commandHandler?.("rank");

    await waitFor(() => {
      expect(testState.toastWarnMock).toHaveBeenCalledWith("未加载赛事");
      expect(testState.toastErrorMock).not.toHaveBeenCalledWith("排行榜数据获取失败");
    });
  });

  it("shows a generic error toast when rank fetching fails unexpectedly", async () => {
    let commandHandler: ((message: string) => void) | undefined;
    testState.fetchWaitingRankingsMock.mockRejectedValueOnce(new Error("network down"));
    testState.subscribeMock.mockImplementation((topic: string, callback: (message: string) => void) => {
      if (topic === MQTT_TOPICS.command) {
        commandHandler = callback;
      }
      return vi.fn();
    });

    renderHook(() => useControlCommands(true, "client-1"));

    await waitFor(() => {
      expect(commandHandler).toBeTypeOf("function");
    });

    commandHandler?.("rank");

    await waitFor(() => {
      expect(testState.toastErrorMock).toHaveBeenCalledWith("排行榜数据获取失败");
    });
  });

  it("loads events when needed and switches to the requested race", async () => {
    let commandHandler: ((message: string) => void) | undefined;
    quizStoreState.events = [];
    testState.quizStoreState = quizStoreState;
    testState.subscribeMock.mockImplementation((topic: string, callback: (message: string) => void) => {
      if (topic === MQTT_TOPICS.command) {
        commandHandler = callback;
      }
      return vi.fn();
    });

    renderHook(() => useControlCommands(true, "client-1"));

    await waitFor(() => {
      expect(commandHandler).toBeTypeOf("function");
    });

    commandHandler?.("race-2");

    await waitFor(() => {
      expect(testState.loadEventsMock).toHaveBeenCalled();
      expect(testState.selectEventByOrdinalMock).toHaveBeenCalledWith(1, "user-1");
      expect(testState.toastSuccessMock).toHaveBeenCalledWith("已切换到赛事 2");
    });
  });

  it("shows an error toast when switching races fails", async () => {
    let commandHandler: ((message: string) => void) | undefined;
    testState.selectEventByOrdinalMock.mockRejectedValueOnce(new Error("boom"));
    testState.subscribeMock.mockImplementation((topic: string, callback: (message: string) => void) => {
      if (topic === MQTT_TOPICS.command) {
        commandHandler = callback;
      }
      return vi.fn();
    });

    renderHook(() => useControlCommands(true, "client-1"));

    await waitFor(() => {
      expect(commandHandler).toBeTypeOf("function");
    });

    commandHandler?.("race-2");

    await waitFor(() => {
      expect(testState.toastErrorMock).toHaveBeenCalledWith("赛事切换失败");
    });
  });

  it("activates the requested stage and routes to the resolved quiz mode", async () => {
    let commandHandler: ((message: string) => void) | undefined;
    quizStoreState.currentStage = createStage({
      stageId: "1",
      kind: "grab",
      name: "题海遨游",
      displayName: "题海遨游",
    });
    testState.quizStoreState = quizStoreState;
    testState.subscribeMock.mockImplementation((topic: string, callback: (message: string) => void) => {
      if (topic === MQTT_TOPICS.command) {
        commandHandler = callback;
      }
      return vi.fn();
    });

    renderHook(() => useControlCommands(true, "client-1"));

    await waitFor(() => {
      expect(commandHandler).toBeTypeOf("function");
    });

    commandHandler?.("1-start");

    await waitFor(() => {
      expect(testState.activateStageByIdMock).toHaveBeenCalledWith("1", "user-1");
      expect(testState.pushMock).toHaveBeenCalledWith("/quiz?mode=ocean-adventure");
    });
  });

  it("clears sprint team selection and routes into buzzer sprint without prompting", async () => {
    let commandHandler: ((message: string) => void) | undefined;
    quizStoreState.currentStage = createStage({
      stageId: "8",
      kind: "standard",
      name: "抢答冲刺",
      displayName: "抢答冲刺",
    });
    testState.quizStoreState = quizStoreState;
    testState.subscribeMock.mockImplementation((topic: string, callback: (message: string) => void) => {
      if (topic === MQTT_TOPICS.command) {
        commandHandler = callback;
      }
      return vi.fn();
    });

    renderHook(() => useControlCommands(true, "client-1"));

    await waitFor(() => {
      expect(commandHandler).toBeTypeOf("function");
    });

    commandHandler?.("8-start");

    await waitFor(() => {
      expect(testState.clearSprintTeamSelectionMock).toHaveBeenCalledTimes(1);
      expect(testState.dialogOpenMock).not.toHaveBeenCalled();
      expect(testState.pushMock).toHaveBeenCalledWith(
        expect.stringMatching(/^\/quiz\?mode=buzzer-sprint&entry=\d+$/)
      );
    });
  });

  it("does not reuse a previously selected sprint team when re-entering the same stage", async () => {
    let commandHandler: ((message: string) => void) | undefined;
    appStoreState.sprintTeamId = "red";
    appStoreState.sprintTeamLocked = true;
    appStoreState.sprintTeamStageId = "8";
    testState.appStoreState = appStoreState;
    quizStoreState.currentStage = createStage({
      stageId: "8",
      kind: "standard",
      name: "抢答冲刺",
      displayName: "抢答冲刺",
    });
    testState.quizStoreState = quizStoreState;
    testState.subscribeMock.mockImplementation((topic: string, callback: (message: string) => void) => {
      if (topic === MQTT_TOPICS.command) {
        commandHandler = callback;
      }
      return vi.fn();
    });

    renderHook(() => useControlCommands(true, "client-1"));

    await waitFor(() => {
      expect(commandHandler).toBeTypeOf("function");
    });

    commandHandler?.("8-start");

    await waitFor(() => {
      expect(testState.dialogOpenMock).not.toHaveBeenCalled();
      expect(testState.clearSprintTeamSelectionMock).toHaveBeenCalledTimes(1);
      expect(testState.pushMock).toHaveBeenCalledWith(
        expect.stringMatching(/^\/quiz\?mode=buzzer-sprint&entry=\d+$/)
      );
    });
  });

  it("shows an error toast when stage activation fails", async () => {
    let commandHandler: ((message: string) => void) | undefined;
    testState.activateStageByIdMock.mockRejectedValueOnce(new Error("activation failed"));
    testState.subscribeMock.mockImplementation((topic: string, callback: (message: string) => void) => {
      if (topic === MQTT_TOPICS.command) {
        commandHandler = callback;
      }
      return vi.fn();
    });

    renderHook(() => useControlCommands(true, "client-1"));

    await waitFor(() => {
      expect(commandHandler).toBeTypeOf("function");
    });

    commandHandler?.("1-start");

    await waitFor(() => {
      expect(testState.toastErrorMock).toHaveBeenCalledWith("环节启动失败");
    });
  });

  it("warns instead of grabbing a question while ocean config is still loading", async () => {
    let commandHandler: ((message: string) => void) | undefined;
    quizStoreState.oceanStageConfigStatus = "loading";
    testState.quizStoreState = quizStoreState;
    testState.subscribeMock.mockImplementation((topic: string, callback: (message: string) => void) => {
      if (topic === MQTT_TOPICS.command) {
        commandHandler = callback;
      }
      return vi.fn();
    });

    renderHook(() => useControlCommands(true, "client-1"));

    await waitFor(() => {
      expect(commandHandler).toBeTypeOf("function");
    });

    commandHandler?.("pool-start");

    await waitFor(() => {
      expect(testState.toastWarnMock).toHaveBeenCalledWith("题海环节配置加载中，请稍候");
      expect(testState.grabNextQuestionMock).not.toHaveBeenCalled();
    });
  });

  it("shows config errors instead of grabbing when ocean config failed to load", async () => {
    let commandHandler: ((message: string) => void) | undefined;
    quizStoreState.oceanStageConfigStatus = "error";
    quizStoreState.oceanStageConfigError = "读取题海环节配置失败";
    testState.quizStoreState = quizStoreState;
    testState.subscribeMock.mockImplementation((topic: string, callback: (message: string) => void) => {
      if (topic === MQTT_TOPICS.command) {
        commandHandler = callback;
      }
      return vi.fn();
    });

    renderHook(() => useControlCommands(true, "client-1"));

    await waitFor(() => {
      expect(commandHandler).toBeTypeOf("function");
    });

    commandHandler?.("pool-start");

    await waitFor(() => {
      expect(testState.toastErrorMock).toHaveBeenCalledWith("读取题海环节配置失败");
      expect(testState.grabNextQuestionMock).not.toHaveBeenCalled();
    });
  });

  it("warns when team mode is returned but no ocean group has been chosen", async () => {
    let commandHandler: ((message: string) => void) | undefined;
    quizStoreState.oceanStageConfigStatus = "success";
    quizStoreState.oceanStageConfig = {
      questionCount: 20,
      timeLimitSeconds: 45,
      mode: "group",
      loadedPresetName: "决赛题包A",
      source: "preset",
      updatedAt: "2026-04-08T08:39:59.033Z",
    };
    appStoreState.oceanGroupId = null;
    testState.appStoreState = appStoreState;
    testState.quizStoreState = quizStoreState;
    testState.subscribeMock.mockImplementation((topic: string, callback: (message: string) => void) => {
      if (topic === MQTT_TOPICS.command) {
        commandHandler = callback;
      }
      return vi.fn();
    });

    renderHook(() => useControlCommands(true, "client-1"));

    await waitFor(() => {
      expect(commandHandler).toBeTypeOf("function");
    });

    commandHandler?.("pool-start");

    await waitFor(() => {
      expect(testState.toastWarnMock).toHaveBeenCalledWith("请先选择红队或蓝队");
      expect(testState.grabNextQuestionMock).not.toHaveBeenCalled();
    });
  });

  it("locks the chosen ocean group and grabs the next question for valid pool-start commands", async () => {
    let commandHandler: ((message: string) => void) | undefined;
    quizStoreState.oceanStageConfigStatus = "success";
    quizStoreState.oceanStageConfig = {
      questionCount: 20,
      timeLimitSeconds: 45,
      mode: "group",
      loadedPresetName: "决赛题包A",
      source: "preset",
      updatedAt: "2026-04-08T08:39:59.033Z",
    };
    appStoreState.oceanGroupId = "red";
    testState.appStoreState = appStoreState;
    testState.quizStoreState = quizStoreState;

    testState.subscribeMock.mockImplementation((topic: string, callback: (message: string) => void) => {
      if (topic === MQTT_TOPICS.command) {
        commandHandler = callback;
      }
      return vi.fn();
    });

    renderHook(() => useControlCommands(true, "client-1"));

    await waitFor(() => {
      expect(commandHandler).toBeTypeOf("function");
    });

    commandHandler?.("pool-start");

    await waitFor(() => {
      expect(testState.setOceanGroupLockedMock).toHaveBeenCalledWith(true);
      expect(testState.grabNextQuestionMock).toHaveBeenCalledWith("user-1", "red");
    });
  });

  it("suppresses empty-pool errors for pool-start commands", async () => {
    let commandHandler: ((message: string) => void) | undefined;
    quizStoreState.oceanStageConfigStatus = "success";
    quizStoreState.oceanStageConfig = {
      questionCount: 20,
      timeLimitSeconds: 45,
      mode: "solo",
      loadedPresetName: "决赛题包A",
      source: "preset",
      updatedAt: "2026-04-08T08:39:59.033Z",
    };
    testState.quizStoreState = quizStoreState;
    testState.grabNextQuestionMock.mockRejectedValueOnce(
      new ApiError(400, "题库已空，暂无可用题目")
    );
    testState.subscribeMock.mockImplementation((topic: string, callback: (message: string) => void) => {
      if (topic === MQTT_TOPICS.command) {
        commandHandler = callback;
      }
      return vi.fn();
    });

    renderHook(() => useControlCommands(true, "client-1"));

    await waitFor(() => {
      expect(commandHandler).toBeTypeOf("function");
    });

    commandHandler?.("pool-start");

    await waitFor(() => {
      expect(testState.grabNextQuestionMock).toHaveBeenCalledWith("user-1", undefined);
      expect(testState.toastErrorMock).not.toHaveBeenCalled();
    });
  });

  it("shows the thrown message when pool-start question fetching fails unexpectedly", async () => {
    let commandHandler: ((message: string) => void) | undefined;
    quizStoreState.oceanStageConfigStatus = "success";
    quizStoreState.oceanStageConfig = {
      questionCount: 20,
      timeLimitSeconds: 45,
      mode: "solo",
      loadedPresetName: "决赛题包A",
      source: "preset",
      updatedAt: "2026-04-08T08:39:59.033Z",
    };
    testState.quizStoreState = quizStoreState;
    testState.grabNextQuestionMock.mockRejectedValueOnce(new Error("接口超时"));
    testState.subscribeMock.mockImplementation((topic: string, callback: (message: string) => void) => {
      if (topic === MQTT_TOPICS.command) {
        commandHandler = callback;
      }
      return vi.fn();
    });

    renderHook(() => useControlCommands(true, "client-1"));

    await waitFor(() => {
      expect(commandHandler).toBeTypeOf("function");
    });

    commandHandler?.("pool-start");

    await waitFor(() => {
      expect(testState.toastErrorMock).toHaveBeenCalledWith("接口超时");
    });
  });

  it("publishes online presence on state subscription success and sends heartbeats", async () => {
    let stateSubscribeOptions:
      | {
          onSuccess?: () => void;
        }
      | undefined;
    const stateTopic = MQTT_TOPICS.stateForClient("client-1");

    testState.subscribeMock.mockImplementation(
      (
        topic: string,
        _callback: (message: string) => void,
        options?: {
          onSuccess?: () => void;
        }
      ) => {
        if (topic === stateTopic) {
          stateSubscribeOptions = options;
        }
        return vi.fn();
      }
    );

    renderHook(() => useControlCommands(true, "client-1"));

    expect(stateSubscribeOptions).toBeDefined();

    vi.useFakeTimers();
    stateSubscribeOptions?.onSuccess?.();

    expect(testState.mqttPublishMock).toHaveBeenCalledWith(stateTopic, "online", {
      qos: 0,
      retain: true,
    });

    vi.advanceTimersByTime(22_500);

    expect(testState.mqttPublishMock).toHaveBeenCalledTimes(2);
    expect(testState.mqttPublishMock).toHaveBeenLastCalledWith(stateTopic, "online", {
      qos: 0,
      retain: true,
    });

    vi.useRealTimers();
  });

  it("publishes offline presence on beforeunload and unmount cleanup after going online", async () => {
    let stateSubscribeOptions:
      | {
          onSuccess?: () => void;
        }
      | undefined;
    const stateTopic = MQTT_TOPICS.stateForClient("client-1");

    testState.subscribeMock.mockImplementation(
      (
        topic: string,
        _callback: (message: string) => void,
        options?: {
          onSuccess?: () => void;
        }
      ) => {
        if (topic === stateTopic) {
          stateSubscribeOptions = options;
        }
        return vi.fn();
      }
    );

    const { unmount } = renderHook(() => useControlCommands(true, "client-1"));

    expect(stateSubscribeOptions).toBeDefined();

    vi.useFakeTimers();
    stateSubscribeOptions?.onSuccess?.();
    testState.mqttPublishMock.mockClear();

    window.dispatchEvent(new Event("beforeunload"));
    expect(testState.mqttPublishMock).toHaveBeenCalledWith(stateTopic, "offline", {
      qos: 0,
      retain: true,
    });

    testState.mqttPublishMock.mockClear();
    stateSubscribeOptions?.onSuccess?.();
    unmount();
    vi.runOnlyPendingTimers();

    expect(testState.mqttPublishMock).toHaveBeenCalledWith(stateTopic, "offline", {
      qos: 0,
      retain: true,
    });

    vi.useRealTimers();
  });
});
