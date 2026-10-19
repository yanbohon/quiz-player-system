import { getPublicEnv, isPublicEnvEnabled } from "@/config/env";

// MQTT can be disabled by setting VITE_MQTT_ENABLED=false or NEXT_PUBLIC_MQTT_ENABLED=false.
const MQTT_ENABLED = isPublicEnvEnabled("MQTT_ENABLED", true);
const MQTT_URL = getPublicEnv("MQTT_URL");

function normalizeTopic(input: string | undefined, fallback: string) {
  const value = input?.trim();
  if (!value) return fallback;
  return value.replace(/^\/+/, "").replace(/\/+$/, "");
}

function joinTopicSegments(...segments: Array<string | undefined>) {
  return segments
    .map((segment) =>
      segment
        ? segment.replace(/^\/+/, "").replace(/\/+$/, "")
        : ""
    )
    .filter(Boolean)
    .join("/");
}

export const MQTT_CONFIG =
  MQTT_ENABLED && MQTT_URL
    ? {
        url: MQTT_URL,
        username: getPublicEnv("MQTT_USERNAME"),
        password: getPublicEnv("MQTT_PASSWORD"),
      }
    : undefined;

const STATE_TOPIC_PREFIX = normalizeTopic(
  getPublicEnv("MQTT_TOPIC_STATE_PREFIX"),
  "state"
);

export const MQTT_TOPICS = {
  command: normalizeTopic(getPublicEnv("MQTT_TOPIC_COMMAND"), "cmd"),
  control: normalizeTopic(getPublicEnv("MQTT_TOPIC_CONTROL"), "quiz/control"),
  buzzIn: normalizeTopic(getPublicEnv("MQTT_TOPIC_BUZZ_IN"), "quiz/buzz_in"),
  result: normalizeTopic(getPublicEnv("MQTT_TOPIC_RESULT"), "quiz/result"),
  statePrefix: STATE_TOPIC_PREFIX,
  stateForClient(clientId: string) {
    return joinTopicSegments(STATE_TOPIC_PREFIX, clientId);
  },
};

export const FUSION_API_CONFIG = {
  baseUrl: getPublicEnv("FUSION_API_BASE") ?? "",
  token: getPublicEnv("FUSION_API_TOKEN") ?? "",
  spaceId: getPublicEnv("FUSION_SPACE_ID") ?? "",
  eventNodeId: getPublicEnv("FUSION_EVENT_NODE_ID") ?? "",
};
