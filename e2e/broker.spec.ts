import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  BROKER_BUZZ_IN_TOPIC,
  BROKER_CONTROL_TOPIC,
  brokerStateTopicForClient,
  BROKER_COMMAND_TOPIC,
  BROKER_RESULT_TOPIC,
} from "./utils/broker-env";
import { seedStores, waitForE2EBridge } from "./utils/bridge";
import {
  mockFusionDatasheet,
  mockFusionEvents,
  mockGrabQuestionSequence,
  mockOceanStageConfig,
} from "./utils/mock-api";
import {
  collectLiveMqttMessages,
  publishLiveMqttMessage,
  waitForLiveMqttMessage,
} from "./utils/live-mqtt";

test.describe.configure({ mode: "serial" });

const speedStage = {
  order: 1,
  stageId: "1",
  recordId: "stage-speed-live",
  name: "争分夺秒",
  displayName: "争分夺秒",
  questionSheetId: "sheet-speed-live",
  scoreSheetId: "score-speed-live",
  generalSheetId: "general-speed-live",
  kind: "standard",
  rawFields: {},
} as const;

const speedQuestions = [
  {
    id: "live-q1",
    type: "单选题",
    content: "实时速度题 1",
    options: [
      { value: "A", text: "实时答案 A1" },
      { value: "B", text: "实时答案 B1" },
    ],
    answer: ["A"],
    source: "default",
  },
  {
    id: "live-q2",
    type: "单选题",
    content: "实时速度题 2",
    options: [
      { value: "A", text: "实时答案 A2" },
      { value: "B", text: "实时答案 B2" },
    ],
    answer: ["B"],
    source: "default",
  },
] as const;

const rankStage = {
  order: 9,
  stageId: "rank-live",
  recordId: "stage-rank-live",
  name: "总分排名",
  displayName: "总分排名",
  generalSheetId: "rank-sheet-live",
  kind: "meta",
  rawFields: {},
} as const;

const oceanStage = {
  order: 2,
  stageId: "pool-live",
  recordId: "stage-pool-live",
  name: "题海遨游",
  displayName: "题海遨游",
  generalSheetId: "general-ocean-live",
  kind: "grab",
  rawFields: {},
} as const;

const ultimateStage = {
  order: 3,
  stageId: "ultimate-concurrent-live",
  recordId: "stage-ultimate-concurrent-live",
  name: "终极挑战",
  displayName: "终极挑战",
  kind: "standard",
  rawFields: {
    模式: "ultimate-challenge",
  },
} as const;

async function waitForMqttConnection(page: Page) {
  await page.waitForFunction(
    () => window.__E2E__?.getAppState().mqttConnected === true
  );
  await page.waitForTimeout(1500);
}

async function createConcurrentClient(
  browser: Browser,
  options: {
    userId: string;
    userName: string;
    quiz?: Record<string, unknown>;
  }
) {
  const context = await browser.newContext();
  const page = await context.newPage();

  await seedStores(page, {
    app: {
      user: {
        id: options.userId,
        name: options.userName,
      },
      isAuthenticated: true,
    },
    quiz: options.quiz,
  });

  return {
    context,
    page,
    userId: options.userId,
    userName: options.userName,
  };
}

type ConcurrentClient = Awaited<ReturnType<typeof createConcurrentClient>>;

async function closeContexts(contexts: BrowserContext[]) {
  await Promise.all(
    contexts.map(async (context) => {
      try {
        await context.close();
      } catch {
        // Ignore shutdown errors from already-closed test contexts.
      }
    })
  );
}

const ultimateQuestion = [
  {
    id: "ultimate-concurrent-q1",
    type: "单选题",
    content: "并发抢答题目 1",
    options: [
      { value: "A", text: "并发答案 A" },
      { value: "B", text: "并发答案 B" },
    ],
    answer: ["A"],
    source: "default",
  },
] as const;

function createUltimateConcurrentQuizSeed(options?: {
  eventId?: string;
  eventName?: string;
}) {
  return {
    selectedEvent: {
      id: options?.eventId ?? "event-ultimate-concurrent-live",
      name: options?.eventName ?? "实时抢答并发赛",
      type: "folder",
      index: 0,
    },
    currentStage: ultimateStage,
    stages: [ultimateStage],
    questions: ultimateQuestion,
    currentIndex: 0,
    questionGateOpened: true,
    waitingForStageStart: false,
    teamProfiles: {
      "1001": {
        recordId: "team-ultimate-1001",
        identifier: "1001",
        displayName: "一号竞答队",
        fields: {
          参赛账号: "1001",
          学校名: "一号竞答队",
        },
      },
      "1002": {
        recordId: "team-ultimate-1002",
        identifier: "1002",
        displayName: "二号竞答队",
        fields: {
          参赛账号: "1002",
          学校名: "二号竞答队",
        },
      },
    },
  } as const;
}

async function openConcurrentUltimateClients(
  browser: Browser,
  options?: {
    eventId?: string;
    eventName?: string;
  }
) {
  const sharedQuizSeed = createUltimateConcurrentQuizSeed(options);

  const clientA = await createConcurrentClient(browser, {
    userId: "1001",
    userName: "1号台",
    quiz: sharedQuizSeed,
  });
  const clientB = await createConcurrentClient(browser, {
    userId: "1002",
    userName: "2号台",
    quiz: sharedQuizSeed,
  });

  try {
    await Promise.all([
      clientA.page.goto("/quiz?mode=ultimate-challenge"),
      clientB.page.goto("/quiz?mode=ultimate-challenge"),
    ]);
    await Promise.all([
      waitForE2EBridge(clientA.page),
      waitForE2EBridge(clientB.page),
    ]);
    await Promise.all([
      waitForMqttConnection(clientA.page),
      waitForMqttConnection(clientB.page),
    ]);
    return { clientA, clientB };
  } catch (error) {
    await closeContexts([clientA.context, clientB.context]);
    throw error;
  }
}

async function triggerConcurrentUltimateBuzz(
  clientA: ConcurrentClient,
  clientB: ConcurrentClient
) {
  await publishLiveMqttMessage({
    topic: BROKER_CONTROL_TOPIC,
    payload: JSON.stringify({ action: "start_buzzing" }),
  });

  await Promise.all([
    expect(clientA.page.getByRole("button", { name: "抢答" })).toBeEnabled(),
    expect(clientB.page.getByRole("button", { name: "抢答" })).toBeEnabled(),
  ]);

  const buzzPayloads = await collectLiveMqttMessages({
    topic: BROKER_BUZZ_IN_TOPIC,
    count: 2,
    predicate: (payload) => {
      try {
        const parsed = JSON.parse(payload) as { player_id?: unknown };
        return typeof parsed.player_id === "string";
      } catch {
        return false;
      }
    },
    afterSubscribe: async () => {
      await Promise.all([
        clientA.page.getByRole("button", { name: "抢答" }).click(),
        clientB.page.getByRole("button", { name: "抢答" }).click(),
      ]);
    },
  });

  const buzzPlayers = buzzPayloads
    .map((payload) => JSON.parse(payload) as { player_id: string })
    .map((payload) => payload.player_id)
    .sort();
  expect(buzzPlayers).toEqual(["1001", "1002"]);
}

test("real broker commands unlock ultimate-pk and can refresh back to waiting", async ({
  page,
}) => {
  await page.goto("/quiz?mode=ultimate-pk");

  await waitForMqttConnection(page);

  await expect(page.getByText("等待主持人允许切换")).toBeVisible();
  await expect(page.getByRole("button", { name: "切换发言" })).toBeDisabled();

  await publishLiveMqttMessage({
    topic: BROKER_COMMAND_TOPIC,
    payload: "stage-3",
  });

  await expect(page.getByText("当前可切换发言队伍")).toBeVisible();
  await expect(page.getByRole("button", { name: "切换发言" })).toBeEnabled();

  await publishLiveMqttMessage({
    topic: BROKER_COMMAND_TOPIC,
    payload: "refresh",
  });

  await page.waitForFunction(() => window.location.pathname === "/waiting");
  await expect(page.getByText("比赛等待区")).toBeVisible();
});

test("real broker question command switches the active speed-run question", async ({
  page,
}) => {
  await seedStores(page, {
    quiz: {
      stages: [speedStage],
      currentStage: speedStage,
      selectedEvent: {
        id: "event-speed-live",
        name: "实时速度赛测试",
        type: "folder",
        index: 0,
      },
      questions: speedQuestions,
      currentIndex: 0,
      waitingForStageStart: false,
      questionGateOpened: true,
      progress: {
        total: speedQuestions.length,
        answered: 0,
      },
    },
  });

  await page.goto("/quiz?mode=speed-run");
  await waitForE2EBridge(page);
  await waitForMqttConnection(page);

  await expect(page.getByText("实时速度题 1")).toBeVisible();

  await publishLiveMqttMessage({
    topic: BROKER_COMMAND_TOPIC,
    payload: "question 2",
  });

  await expect(page.getByText("实时速度题 2")).toBeVisible();
});

test("real broker home command resets the waiting page back to the default ticket view", async ({
  page,
}) => {
  await seedStores(page, {
    quiz: {
      selectedEvent: {
        id: "event-home-live",
        name: "实时等待区测试",
        type: "folder",
        index: 0,
      },
      teamProfile: {
        recordId: "team-home-live",
        identifier: "1001",
        displayName: "实时测试中学",
        fields: {
          学校名: "实时测试中学",
          参赛账号: "1001",
        },
      },
      waitingTicketView: "rank",
      rankStatus: "success",
      rankEntries: [
        { id: "rank-1", schoolName: "实时测试中学", score: 100 },
        { id: "rank-2", schoolName: "实时第二中学", score: 95 },
      ],
    },
  });

  await page.goto("/waiting");
  await waitForE2EBridge(page);
  await waitForMqttConnection(page);

  await expect(page.getByText("总分排行榜")).toBeVisible();
  await expect(page.getByText("实时第二中学")).toBeVisible();

  await publishLiveMqttMessage({
    topic: BROKER_COMMAND_TOPIC,
    payload: "home",
  });

  await expect(page.getByText("总分排行榜")).toBeHidden();
  await expect(page.getByText("等待开始环节...")).toBeVisible();
  await expect(page.getByText("当前赛事")).toBeVisible();
});

test("real broker race command loads event configuration and updates the waiting ticket", async ({
  page,
}) => {
  await mockFusionEvents(page, [
    {
      id: "event-race-live",
      name: "实时赛事 1",
      type: "folder",
    },
  ]);
  await mockFusionDatasheet(page, "event-race-live", [
    {
      recordId: "poster-race-live",
      fields: {
        环节名称: "赛事海报",
        URL: "",
      },
    },
    {
      recordId: "stage-meta-live",
      fields: {
        ID: "0",
        环节名称: "学校信息",
        通用表ID: "general-race-live",
      },
    },
    {
      recordId: "stage-speed-race-live",
      fields: {
        ID: "1",
        环节名称: "争分夺秒",
        题库表ID: "sheet-speed-race-live",
        分数表ID: "score-race-live",
        通用表ID: "general-race-live",
      },
    },
  ]);
  await mockFusionDatasheet(page, "general-race-live", [
    {
      recordId: "team-race-live",
      fields: {
        参赛账号: "1001",
        学校名: "实时赛事中学",
      },
    },
  ]);

  await page.goto("/waiting");
  await waitForE2EBridge(page);
  await waitForMqttConnection(page);

  await expect(page.getByText("尚未匹配")).toBeVisible();

  await publishLiveMqttMessage({
    topic: BROKER_COMMAND_TOPIC,
    payload: "race-1",
  });

  await expect(page.getByText("实时赛事 1")).toBeVisible();
  await expect(page.getByText("实时赛事中学").first()).toBeVisible();
});

test("real broker rank command loads and displays the waiting leaderboard", async ({
  page,
}) => {
  await mockFusionDatasheet(page, "rank-sheet-live", [
    {
      recordId: "rank-live-1",
      fields: {
        学校名: "实时榜首中学",
        总分: 108,
      },
    },
    {
      recordId: "rank-live-2",
      fields: {
        学校名: "实时第二中学",
        总分: 96,
      },
    },
  ]);

  await seedStores(page, {
    quiz: {
      selectedEvent: {
        id: "event-rank-live",
        name: "实时排行榜测试",
        type: "folder",
        index: 0,
      },
      stages: [rankStage],
    },
  });

  await page.goto("/waiting");
  await waitForE2EBridge(page);
  await waitForMqttConnection(page);

  await publishLiveMqttMessage({
    topic: BROKER_COMMAND_TOPIC,
    payload: "rank",
  });

  await expect(page.getByText("总分排行榜")).toBeVisible();
  await expect(page.getByText("实时榜首中学")).toBeVisible();
  await expect(page.getByText("108分")).toBeVisible();
  await expect(page.getByText("实时第二中学")).toBeVisible();
});

test("real broker rank command warns when no ranking stage is loaded", async ({
  page,
}) => {
  await seedStores(page, {
    quiz: {
      selectedEvent: {
        id: "event-rank-missing-live",
        name: "实时缺榜测试",
        type: "folder",
        index: 0,
      },
      stages: [],
    },
  });

  await page.goto("/waiting");
  await waitForE2EBridge(page);
  await waitForMqttConnection(page);

  await publishLiveMqttMessage({
    topic: BROKER_COMMAND_TOPIC,
    payload: "rank",
  });

  await expect(page.getByText("未加载赛事")).toBeVisible();
  await expect(page.getByText("等待开始环节...")).toBeVisible();
});

test("real broker can drive the full race-select to stage-start to question-switch chain", async ({
  page,
}) => {
  await mockFusionEvents(page, [
    {
      id: "event-chain-live",
      name: "实时联调赛事",
      type: "folder",
    },
  ]);
  await mockFusionDatasheet(page, "event-chain-live", [
    {
      recordId: "poster-chain-live",
      fields: {
        环节名称: "赛事海报",
        URL: "",
      },
    },
    {
      recordId: "stage-meta-chain-live",
      fields: {
        ID: "0",
        环节名称: "学校信息",
        通用表ID: "general-chain-live",
      },
    },
    {
      recordId: "stage-speed-chain-live",
      fields: {
        ID: "1",
        环节名称: "争分夺秒",
        题库表ID: "sheet-speed-chain-live",
        分数表ID: "score-chain-live",
        通用表ID: "general-chain-live",
      },
    },
  ]);
  await mockFusionDatasheet(page, "general-chain-live", [
    {
      recordId: "team-chain-live",
      fields: {
        参赛账号: "1001",
        学校名: "实时联调中学",
      },
    },
  ]);
  await mockFusionDatasheet(page, "score-chain-live", [
    {
      recordId: "score-chain-live",
      fields: {
        参赛账号: "1001",
        总分: 0,
      },
    },
  ]);
  await mockFusionDatasheet(page, "sheet-speed-chain-live", [
    {
      recordId: "chain-q1",
      fields: {
        ID: "chain-q1",
        type: "单选题",
        stem: "实时联调题目 1",
        options: "A. 联调答案 1\nB. 联调干扰 1",
        answer: "A",
      },
    },
    {
      recordId: "chain-q2",
      fields: {
        ID: "chain-q2",
        type: "单选题",
        stem: "实时联调题目 2",
        options: "A. 联调答案 2\nB. 联调干扰 2",
        answer: "A",
      },
    },
  ]);

  await page.goto("/waiting");
  await waitForE2EBridge(page);
  await waitForMqttConnection(page);

  await publishLiveMqttMessage({
    topic: BROKER_COMMAND_TOPIC,
    payload: "race-1",
  });

  await expect(page.getByText("实时联调赛事")).toBeVisible();
  await expect(page.getByText("实时联调中学").first()).toBeVisible();

  await publishLiveMqttMessage({
    topic: BROKER_COMMAND_TOPIC,
    payload: "1-start",
  });

  await page.waitForURL("**/quiz?mode=speed-run");
  await expect(page.getByText("题目加载完成")).toBeVisible();

  await publishLiveMqttMessage({
    topic: BROKER_COMMAND_TOPIC,
    payload: "question 2",
  });

  await expect(page.getByText("实时联调题目 2")).toBeVisible();
});

test("real broker invalid stage-start command surfaces an error and stays on waiting", async ({
  page,
}) => {
  await seedStores(page, {
    quiz: {
      selectedEvent: {
        id: "event-invalid-stage-live",
        name: "实时无效环节测试",
        type: "folder",
        index: 0,
      },
      stages: [speedStage],
    },
  });

  await page.goto("/waiting");
  await waitForE2EBridge(page);
  await waitForMqttConnection(page);

  await publishLiveMqttMessage({
    topic: BROKER_COMMAND_TOPIC,
    payload: "99-start",
  });

  await expect(page.getByText("环节启动失败")).toBeVisible();
  await page.waitForURL("**/waiting");
  await expect(page.getByText("比赛等待区")).toBeVisible();
});

test("real broker stage-start command activates a speed-run stage and routes to quiz mode", async ({
  page,
}) => {
  await mockFusionDatasheet(page, "sheet-speed-live", [
    {
      recordId: "live-speed-q1",
      fields: {
        ID: "live-speed-q1",
        type: "单选题",
        stem: "实时启动题目 1",
        options: "A. 正确答案\nB. 错误答案",
        answer: "A",
      },
    },
    {
      recordId: "live-speed-q2",
      fields: {
        ID: "live-speed-q2",
        type: "单选题",
        stem: "实时启动题目 2",
        options: "A. 第二题正确\nB. 第二题错误",
        answer: "A",
      },
    },
  ]);
  await mockFusionDatasheet(page, "general-speed-live", [
    {
      recordId: "team-speed-live",
      fields: {
        参赛账号: "1001",
        学校名: "实时启动中学",
      },
    },
  ]);
  await mockFusionDatasheet(page, "score-speed-live", [
    {
      recordId: "score-speed-live",
      fields: {
        参赛账号: "1001",
        总分: 0,
      },
    },
  ]);

  await seedStores(page, {
    quiz: {
      selectedEvent: {
        id: "event-stage-live",
        name: "实时启动测试",
        type: "folder",
        index: 0,
      },
      stages: [speedStage],
    },
  });

  await page.goto("/waiting");
  await waitForE2EBridge(page);
  await waitForMqttConnection(page);

  await publishLiveMqttMessage({
    topic: BROKER_COMMAND_TOPIC,
    payload: "1-start",
  });

  await page.waitForURL("**/quiz?mode=speed-run");
  await expect(page.getByText("题目加载完成")).toBeVisible();
  await expect(page.getByText("请做好准备 比赛即将开始")).toBeVisible();
});

test("real broker pool-start command warns when team mode has no selected group", async ({
  page,
}) => {
  await mockOceanStageConfig(page, {
    mode: "group",
    questionCount: 12,
    timeLimitSeconds: 600,
  });

  await seedStores(page, {
    quiz: {
      selectedEvent: {
        id: "event-ocean-warn-live",
        name: "实时题海告警测试",
        type: "folder",
        index: 0,
      },
      currentStage: oceanStage,
      stages: [oceanStage],
      waitingForStageStart: true,
      questionGateOpened: true,
      oceanRemainingCount: 12,
      oceanStageConfigStatus: "success",
      oceanStageConfig: {
        mode: "group",
        questionCount: 12,
        timeLimitSeconds: 600,
        loadedPresetName: "E2E 题包",
        source: "preset",
        updatedAt: "2026-05-13T00:00:00.000Z",
      },
    },
  });

  await page.goto("/quiz?mode=ocean-adventure");
  await waitForE2EBridge(page);
  await waitForMqttConnection(page);

  await publishLiveMqttMessage({
    topic: BROKER_COMMAND_TOPIC,
    payload: "pool-start",
  });

  await expect(page.getByText("请先选择红队或蓝队")).toBeVisible();
  await expect(page.getByText("题库准备就绪")).toBeVisible();
  await page.waitForURL("**/quiz?mode=ocean-adventure");
});

test("real broker pool-start command grabs the first ocean question after mode selection", async ({
  page,
}) => {
  await mockOceanStageConfig(page, {
    mode: "solo",
    questionCount: 12,
    timeLimitSeconds: 600,
  });

  await mockGrabQuestionSequence(page, [
    {
      success: true,
      questionId: "ocean-live-1",
      remainingCount: 11,
      question: {
        id: "ocean-live-1",
        title: "实时题海题 1",
        type: "单选题",
        options: [
          { value: "opt-1", text: "实时第一项" },
          { value: "opt-2", text: "实时第二项" },
        ],
        answer: ["opt-1"],
        categories: ["生物"],
      },
    },
  ]);

  await seedStores(page, {
    app: {
      oceanPlayMode: "solo",
    },
    quiz: {
      selectedEvent: {
        id: "event-ocean-live",
        name: "实时题海测试",
        type: "folder",
        index: 0,
      },
      currentStage: oceanStage,
      stages: [oceanStage],
      waitingForStageStart: true,
      questionGateOpened: true,
      oceanRemainingCount: 12,
      oceanStageConfigStatus: "success",
      oceanStageConfig: {
        mode: "solo",
        questionCount: 12,
        timeLimitSeconds: 600,
        loadedPresetName: "E2E 题包",
        source: "preset",
        updatedAt: "2026-05-13T00:00:00.000Z",
      },
    },
  });

  await page.goto("/quiz?mode=ocean-adventure");
  await waitForE2EBridge(page);
  await waitForMqttConnection(page);

  await expect(page.getByText("题库准备就绪")).toBeVisible();
  await expect(page.getByText("当前环节为个人模式，主持人开始后将直接抢题。")).toBeVisible();

  await publishLiveMqttMessage({
    topic: BROKER_COMMAND_TOPIC,
    payload: "pool-start",
  });

  await expect(page.getByText("实时题海题 1")).toBeVisible();
  await expect(page.getByText("生物")).toBeVisible();
});

test("real broker broadcasts race-start-question-refresh chain to two concurrent clients", async ({
  browser,
}) => {
  const clientA = await createConcurrentClient(browser, {
    userId: "1001",
    userName: "1号台",
  });
  const clientB = await createConcurrentClient(browser, {
    userId: "1002",
    userName: "2号台",
  });

  try {
    const pages = [clientA.page, clientB.page];

    await Promise.all(
      pages.map((page) =>
        mockFusionEvents(page, [
          {
            id: "event-concurrent-live",
            name: "实时双端赛事",
            type: "folder",
          },
        ])
      )
    );

    await Promise.all(
      pages.map((page) =>
        mockFusionDatasheet(page, "event-concurrent-live", [
          {
            recordId: "poster-concurrent-live",
            fields: {
              环节名称: "赛事海报",
              URL: "",
            },
          },
          {
            recordId: "stage-meta-concurrent-live",
            fields: {
              ID: "0",
              环节名称: "学校信息",
              通用表ID: "general-concurrent-live",
            },
          },
          {
            recordId: "stage-speed-concurrent-live",
            fields: {
              ID: "1",
              环节名称: "争分夺秒",
              题库表ID: "sheet-speed-concurrent-live",
              分数表ID: "score-concurrent-live",
              通用表ID: "general-concurrent-live",
            },
          },
        ])
      )
    );

    await Promise.all(
      pages.map((page) =>
        mockFusionDatasheet(page, "general-concurrent-live", [
          {
            recordId: "team-concurrent-live-1001",
            fields: {
              参赛账号: "1001",
              学校名: "实时一号中学",
            },
          },
          {
            recordId: "team-concurrent-live-1002",
            fields: {
              参赛账号: "1002",
              学校名: "实时二号中学",
            },
          },
        ])
      )
    );

    await Promise.all(
      pages.map((page) =>
        mockFusionDatasheet(page, "score-concurrent-live", [
          {
            recordId: "score-concurrent-live-1001",
            fields: {
              参赛账号: "1001",
              总分: 0,
            },
          },
          {
            recordId: "score-concurrent-live-1002",
            fields: {
              参赛账号: "1002",
              总分: 0,
            },
          },
        ])
      )
    );

    await Promise.all(
      pages.map((page) =>
        mockFusionDatasheet(page, "sheet-speed-concurrent-live", [
          {
            recordId: "concurrent-q1",
            fields: {
              ID: "concurrent-q1",
              type: "单选题",
              stem: "多端联调题目 1",
              options: "A. 双端答案 1\nB. 双端干扰 1",
              answer: "A",
            },
          },
          {
            recordId: "concurrent-q2",
            fields: {
              ID: "concurrent-q2",
              type: "单选题",
              stem: "多端联调题目 2",
              options: "A. 双端答案 2\nB. 双端干扰 2",
              answer: "A",
            },
          },
        ])
      )
    );

    await Promise.all(pages.map((page) => page.goto("/waiting")));
    await Promise.all(pages.map((page) => waitForE2EBridge(page)));
    await Promise.all(pages.map((page) => waitForMqttConnection(page)));

    await Promise.all([
      expect(
        waitForLiveMqttMessage({
          topic: brokerStateTopicForClient(clientA.userId),
          predicate: (payload) => payload === "online",
        })
      ).resolves.toBe("online"),
      expect(
        waitForLiveMqttMessage({
          topic: brokerStateTopicForClient(clientB.userId),
          predicate: (payload) => payload === "online",
        })
      ).resolves.toBe("online"),
    ]);

    await publishLiveMqttMessage({
      topic: BROKER_COMMAND_TOPIC,
      payload: "race-1",
    });

    await expect(clientA.page.getByText("实时双端赛事")).toBeVisible();
    await expect(clientA.page.getByText("实时一号中学").first()).toBeVisible();
    await expect(clientB.page.getByText("实时双端赛事")).toBeVisible();
    await expect(clientB.page.getByText("实时二号中学").first()).toBeVisible();

    await publishLiveMqttMessage({
      topic: BROKER_COMMAND_TOPIC,
      payload: "1-start",
    });

    await Promise.all([
      clientA.page.waitForURL("**/quiz?mode=speed-run"),
      clientB.page.waitForURL("**/quiz?mode=speed-run"),
    ]);
    await Promise.all([
      expect(clientA.page.getByText("题目加载完成")).toBeVisible(),
      expect(clientB.page.getByText("题目加载完成")).toBeVisible(),
    ]);

    await publishLiveMqttMessage({
      topic: BROKER_COMMAND_TOPIC,
      payload: "question 2",
    });

    await Promise.all([
      expect(clientA.page.getByText("多端联调题目 2")).toBeVisible(),
      expect(clientB.page.getByText("多端联调题目 2")).toBeVisible(),
    ]);

    await publishLiveMqttMessage({
      topic: BROKER_COMMAND_TOPIC,
      payload: "refresh",
    });

    await Promise.all([
      clientA.page.waitForURL("**/waiting"),
      clientB.page.waitForURL("**/waiting"),
    ]);
    await Promise.all([
      expect(clientA.page.getByText("比赛等待区")).toBeVisible(),
      expect(clientB.page.getByText("比赛等待区")).toBeVisible(),
    ]);
  } finally {
    await closeContexts([clientA.context, clientB.context]);
  }
});

test("real broker keeps the remaining client in sync after another concurrent client goes offline", async ({
  browser,
}) => {
  const clientA = await createConcurrentClient(browser, {
    userId: "1001",
    userName: "1号台",
  });
  const clientB = await createConcurrentClient(browser, {
    userId: "1002",
    userName: "2号台",
  });

  try {
    const pages = [clientA.page, clientB.page];

    await Promise.all(
      pages.map((page) =>
        mockFusionEvents(page, [
          {
            id: "event-concurrent-drop-live",
            name: "实时离线韧性赛事",
            type: "folder",
          },
        ])
      )
    );

    await Promise.all(
      pages.map((page) =>
        mockFusionDatasheet(page, "event-concurrent-drop-live", [
          {
            recordId: "poster-concurrent-drop-live",
            fields: {
              环节名称: "赛事海报",
              URL: "",
            },
          },
          {
            recordId: "stage-meta-concurrent-drop-live",
            fields: {
              ID: "0",
              环节名称: "学校信息",
              通用表ID: "general-concurrent-drop-live",
            },
          },
          {
            recordId: "stage-speed-concurrent-drop-live",
            fields: {
              ID: "1",
              环节名称: "争分夺秒",
              题库表ID: "sheet-speed-concurrent-drop-live",
              分数表ID: "score-concurrent-drop-live",
              通用表ID: "general-concurrent-drop-live",
            },
          },
        ])
      )
    );

    await Promise.all(
      pages.map((page) =>
        mockFusionDatasheet(page, "general-concurrent-drop-live", [
          {
            recordId: "team-concurrent-drop-live-1001",
            fields: {
              参赛账号: "1001",
              学校名: "实时留在线中学",
            },
          },
          {
            recordId: "team-concurrent-drop-live-1002",
            fields: {
              参赛账号: "1002",
              学校名: "实时离线中学",
            },
          },
        ])
      )
    );

    await Promise.all(
      pages.map((page) =>
        mockFusionDatasheet(page, "score-concurrent-drop-live", [
          {
            recordId: "score-concurrent-drop-live-1001",
            fields: {
              参赛账号: "1001",
              总分: 0,
            },
          },
          {
            recordId: "score-concurrent-drop-live-1002",
            fields: {
              参赛账号: "1002",
              总分: 0,
            },
          },
        ])
      )
    );

    await Promise.all(
      pages.map((page) =>
        mockFusionDatasheet(page, "sheet-speed-concurrent-drop-live", [
          {
            recordId: "concurrent-drop-q1",
            fields: {
              ID: "concurrent-drop-q1",
              type: "单选题",
              stem: "离线韧性题目 1",
              options: "A. 留在线答案 1\nB. 留在线干扰 1",
              answer: "A",
            },
          },
          {
            recordId: "concurrent-drop-q2",
            fields: {
              ID: "concurrent-drop-q2",
              type: "单选题",
              stem: "离线韧性题目 2",
              options: "A. 留在线答案 2\nB. 留在线干扰 2",
              answer: "A",
            },
          },
        ])
      )
    );

    await Promise.all(pages.map((page) => page.goto("/waiting")));
    await Promise.all(pages.map((page) => waitForE2EBridge(page)));
    await Promise.all(pages.map((page) => waitForMqttConnection(page)));

    await publishLiveMqttMessage({
      topic: BROKER_COMMAND_TOPIC,
      payload: "race-1",
    });

    await Promise.all([
      expect(clientA.page.getByText("实时离线韧性赛事")).toBeVisible(),
      expect(clientB.page.getByText("实时离线韧性赛事")).toBeVisible(),
    ]);

    await publishLiveMqttMessage({
      topic: BROKER_COMMAND_TOPIC,
      payload: "1-start",
    });

    await Promise.all([
      clientA.page.waitForURL("**/quiz?mode=speed-run"),
      clientB.page.waitForURL("**/quiz?mode=speed-run"),
    ]);
    await Promise.all([
      expect(clientA.page.getByText("题目加载完成")).toBeVisible(),
      expect(clientB.page.getByText("题目加载完成")).toBeVisible(),
    ]);

    await expect(
      waitForLiveMqttMessage({
        topic: brokerStateTopicForClient(clientB.userId),
        predicate: (payload) => payload === "offline",
        afterSubscribe: async () => {
          await clientB.page.evaluate(() => {
            window.dispatchEvent(new Event("beforeunload"));
          });
          await clientB.context.close();
        },
      })
    ).resolves.toBe("offline");

    await publishLiveMqttMessage({
      topic: BROKER_COMMAND_TOPIC,
      payload: "question 2",
    });

    await expect(clientA.page.getByText("离线韧性题目 2")).toBeVisible();

    await publishLiveMqttMessage({
      topic: BROKER_COMMAND_TOPIC,
      payload: "refresh",
    });

    await clientA.page.waitForURL("**/waiting");
    await expect(clientA.page.getByText("比赛等待区")).toBeVisible();
  } finally {
    await closeContexts([clientA.context, clientB.context]);
  }
});

test("real broker resolves concurrent ultimate buzz attempts to a single winner", async ({
  browser,
}) => {
  const { clientA, clientB } = await openConcurrentUltimateClients(browser);

  try {
    await triggerConcurrentUltimateBuzz(clientA, clientB);

    await publishLiveMqttMessage({
      topic: BROKER_RESULT_TOPIC,
      payload: JSON.stringify({ winnerId: "1002" }),
    });

    await expect(clientA.page.getByText("未抢到答题权")).toBeVisible();
    await expect(clientA.page.getByText("本题将由二号竞答队进行作答")).toBeVisible();
    await expect(clientB.page.getByText("并发抢答题目 1")).toBeVisible();
    await expect(clientB.page.getByText("本队作答中")).toBeVisible();
  } finally {
    await closeContexts([clientA.context, clientB.context]);
  }
});

test("real broker refresh resynchronizes concurrent ultimate clients after winner selection", async ({
  browser,
}) => {
  const { clientA, clientB } = await openConcurrentUltimateClients(browser, {
    eventId: "event-ultimate-refresh-live",
    eventName: "实时抢答复位赛",
  });

  try {
    await triggerConcurrentUltimateBuzz(clientA, clientB);

    await publishLiveMqttMessage({
      topic: BROKER_RESULT_TOPIC,
      payload: JSON.stringify({ winnerId: "1001" }),
    });

    await expect(clientA.page.getByText("并发抢答题目 1")).toBeVisible();
    await expect(clientA.page.getByText("本队作答中")).toBeVisible();
    await expect(clientB.page.getByText("未抢到答题权")).toBeVisible();

    await publishLiveMqttMessage({
      topic: BROKER_COMMAND_TOPIC,
      payload: "refresh",
    });

    await Promise.all([
      clientA.page.waitForURL("**/waiting"),
      clientB.page.waitForURL("**/waiting"),
    ]);
    await Promise.all([
      expect(clientA.page.getByText("比赛等待区")).toBeVisible(),
      expect(clientB.page.getByText("比赛等待区")).toBeVisible(),
    ]);
  } finally {
    await closeContexts([clientA.context, clientB.context]);
  }
});

test("real broker ignores conflicting ultimate winner results after a winner is already selected", async ({
  browser,
}) => {
  const { clientA, clientB } = await openConcurrentUltimateClients(browser, {
    eventId: "event-ultimate-conflict-live",
    eventName: "实时抢答冲突裁决赛",
  });

  try {
    await triggerConcurrentUltimateBuzz(clientA, clientB);

    await publishLiveMqttMessage({
      topic: BROKER_RESULT_TOPIC,
      payload: JSON.stringify({ winnerId: "1001" }),
    });

    await expect(clientA.page.getByText("并发抢答题目 1")).toBeVisible();
    await expect(clientA.page.getByText("本队作答中")).toBeVisible();
    await expect(clientB.page.getByText("未抢到答题权")).toBeVisible();
    await expect(clientB.page.getByText("本题将由一号竞答队进行作答")).toBeVisible();

    await publishLiveMqttMessage({
      topic: BROKER_RESULT_TOPIC,
      payload: JSON.stringify({ winnerId: "1002" }),
    });

    await expect(clientA.page.getByText("并发抢答题目 1")).toBeVisible();
    await expect(clientA.page.getByText("本队作答中")).toBeVisible();
    await expect(clientB.page.getByText("未抢到答题权")).toBeVisible();
    await expect(clientB.page.getByText("本题将由一号竞答队进行作答")).toBeVisible();
  } finally {
    await closeContexts([clientA.context, clientB.context]);
  }
});

test("real broker retains contestant presence and publishes offline before unload", async ({
  page,
}) => {
  const stateTopic = brokerStateTopicForClient("1001");

  await page.goto("/waiting");
  await waitForE2EBridge(page);
  await waitForMqttConnection(page);

  await expect(
    waitForLiveMqttMessage({
      topic: stateTopic,
      predicate: (payload) => payload === "online",
    })
  ).resolves.toBe("online");

  await expect(
    waitForLiveMqttMessage({
      topic: stateTopic,
      predicate: (payload) => payload === "offline",
      afterSubscribe: async () => {
        await page.evaluate(() => {
          window.dispatchEvent(new Event("beforeunload"));
        });
      },
    })
  ).resolves.toBe("offline");
});
