import { ContestModeId, ContestModeMeta } from "./types";

export const CONTEST_MODES: Record<ContestModeMeta["id"], ContestModeMeta> = {
  qa: {
    id: "qa",
    name: "有问必答",
    description:
      "主持人通过 MQTT 逐题推送题目，选手实时作答并立即反馈。",
    channel: "mqtt",
    questionFlow: "push",
    answerFlow: "immediate",
    questionFormat: "standard",
    features: {
      hasHp: false,
      requiresBuzzer: false,
      allowsDelegation: false,
      supportsTimer: false,
      autoAdvance: false,
      localQuestionCache: false,
    },
  },
  "qa-challenge": {
    id: "qa-challenge",
    name: "有问必答挑战题",
    description:
      "题目先由专属队伍选择作答队伍，可选择本队直接作答或挑战其他队伍，再由被选队伍在主持人指令下完成作答。",
    channel: "mqtt",
    questionFlow: "push",
    answerFlow: "immediate",
    questionFormat: "standard",
    features: {
      hasHp: false,
      requiresBuzzer: false,
      allowsDelegation: false,
      supportsTimer: false,
      autoAdvance: false,
      localQuestionCache: false,
    },
  },
  "qa-20": {
    id: "qa-20",
    name: "有问必答(20)",
    description:
      "主持人通过 MQTT 逐题推送题目，选手实时作答并立即反馈。",
    channel: "mqtt",
    questionFlow: "push",
    answerFlow: "immediate",
    questionFormat: "standard",
    features: {
      hasHp: false,
      requiresBuzzer: false,
      allowsDelegation: false,
      supportsTimer: false,
      autoAdvance: false,
      localQuestionCache: false,
    },
  },
  "qa-30": {
    id: "qa-30",
    name: "有问必答(30)",
    description:
      "主持人通过 MQTT 逐题推送题目，选手实时作答并立即反馈。",
    channel: "mqtt",
    questionFlow: "push",
    answerFlow: "immediate",
    questionFormat: "standard",
    features: {
      hasHp: false,
      requiresBuzzer: false,
      allowsDelegation: false,
      supportsTimer: false,
      autoAdvance: false,
      localQuestionCache: false,
    },
  },
  "qa-50": {
    id: "qa-50",
    name: "有问必答(50)",
    description:
      "主持人通过 MQTT 逐题推送题目，选手实时作答并立即反馈。",
    channel: "mqtt",
    questionFlow: "push",
    answerFlow: "immediate",
    questionFormat: "standard",
    features: {
      hasHp: false,
      requiresBuzzer: false,
      allowsDelegation: false,
      supportsTimer: false,
      autoAdvance: false,
      localQuestionCache: false,
    },
  },
  "last-stand": {
    id: "last-stand",
    name: "一站到底",
    description:
      "题目通过 MQTT 推送，启用 3 点血量，答错扣血直至淘汰。",
    channel: "mqtt",
    questionFlow: "push",
    answerFlow: "immediate",
    questionFormat: "standard",
    features: {
      hasHp: true,
      initialHp: 3,
      hpLossPerWrong: 1,
      requiresBuzzer: false,
      allowsDelegation: false,
      supportsTimer: false,
      autoAdvance: false,
      localQuestionCache: false,
    },
  },
  "last-stand-group": {
    id: "last-stand-group",
    name: "一站到底（分组）",
    description:
      "分组进行一站到底，每组仅有一次犯错机会，答错即淘汰并记录分组状态。",
    channel: "mqtt",
    questionFlow: "push",
    answerFlow: "immediate",
    questionFormat: "standard",
    features: {
      hasHp: true,
      initialHp: 1,
      hpLossPerWrong: 1,
      requiresBuzzer: false,
      allowsDelegation: false,
      supportsTimer: false,
      autoAdvance: false,
      localQuestionCache: false,
    },
  },
  "speed-run": {
    id: "speed-run",
    name: "争分夺秒",
    description:
      "一次性拉取整份题包，本地控制答题流程并对每题计时。",
    channel: "api",
    questionFlow: "local",
    answerFlow: "immediate",
    questionFormat: "standard",
    features: {
      hasHp: false,
      requiresBuzzer: false,
      allowsDelegation: false,
      supportsTimer: true,
      autoAdvance: true,
      localQuestionCache: true,
    },
  },
  "ocean-adventure": {
    id: "ocean-adventure",
    name: "题海遨游",
    description:
      "通过抢题接口逐题获取，专用题目结构与两点血量容错。",
    channel: "api",
    questionFlow: "pull",
    answerFlow: "immediate",
    questionFormat: "custom",
    features: {
      hasHp: true,
      initialHp: 2,
      hpLossPerWrong: 1,
      requiresBuzzer: false,
      allowsDelegation: false,
      supportsTimer: true,
      autoAdvance: true,
      localQuestionCache: false,
    },
  },
  "ultimate-challenge": {
    id: "ultimate-challenge",
    name: "终极挑战",
    description:
      "包含抢答与选题机制的综合赛段，由 MQTT 控制节奏。",
    channel: "hybrid",
    questionFlow: "push",
    answerFlow: "external",
    questionFormat: "standard",
    features: {
      hasHp: false,
      requiresBuzzer: true,
      allowsDelegation: true,
      supportsTimer: true,
      autoAdvance: false,
      localQuestionCache: false,
    },
  },
  "buzzer-sprint": {
    id: "buzzer-sprint",
    name: "抢答冲刺",
    description:
      "全题型采用抢答链路的冲刺赛段，进入前需确认红蓝队身份。",
    channel: "hybrid",
    questionFlow: "push",
    answerFlow: "external",
    questionFormat: "standard",
    features: {
      hasHp: false,
      requiresBuzzer: true,
      allowsDelegation: true,
      supportsTimer: true,
      autoAdvance: false,
      localQuestionCache: false,
    },
  },
  "ultimate-pk": {
    id: "ultimate-pk",
    name: "终极PK",
    description:
      "围绕队伍发言权切换的环节，通过 MQTT 指令同步流程。",
    channel: "mqtt",
    questionFlow: "push",
    answerFlow: "external",
    questionFormat: "standard",
    features: {
      hasHp: false,
      requiresBuzzer: false,
      allowsDelegation: false,
      supportsTimer: false,
      autoAdvance: false,
      localQuestionCache: false,
    },
  },
};

export const DEFAULT_MODE = CONTEST_MODES.qa;

export const QA_VARIANT_MODE_IDS: ContestModeId[] = ["qa", "qa-20", "qa-30", "qa-50"];

export function isQaVariantMode(id: ContestModeId): boolean {
  return QA_VARIANT_MODE_IDS.includes(id);
}

const ULTIMATE_BUZZ_MODE_IDS: ContestModeId[] = [
  "ultimate-challenge",
  "buzzer-sprint",
];

export function isUltimateBuzzMode(id: ContestModeId): boolean {
  return ULTIMATE_BUZZ_MODE_IDS.includes(id);
}
