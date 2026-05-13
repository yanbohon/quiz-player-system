import { getPublicEnv, isPublicEnvEnabled } from "@/config/env";

// MQTT can be disabled by setting VITE_MQTT_ENABLED=false or NEXT_PUBLIC_MQTT_ENABLED=false.
const MQTT_ENABLED = isPublicEnvEnabled("MQTT_ENABLED", true);

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

export const MQTT_CONFIG = MQTT_ENABLED ? {
  url: getPublicEnv("MQTT_URL", "wss://ws.ohvfx.com:8084/mqtt")!,
  username: getPublicEnv("MQTT_USERNAME", "xdx")!,
  password: getPublicEnv("MQTT_PASSWORD", "xdx12138")!,
} : undefined;

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
  baseUrl: getPublicEnv("FUSION_API_BASE", "https://api.ohvfx.com/fusion")!,
  token:
    getPublicEnv("FUSION_API_TOKEN", "uskOS7wIpVOyV6glpE7eOY6")!,
  spaceId: getPublicEnv("FUSION_SPACE_ID", "spch5h60Pobkk")!,
  eventNodeId:
    getPublicEnv("FUSION_EVENT_NODE_ID", "foduzcRW7MGLv")!,
};
