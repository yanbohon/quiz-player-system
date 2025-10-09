import { ContestModeMeta } from "./types";

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
};

export const DEFAULT_MODE = CONTEST_MODES.qa;

