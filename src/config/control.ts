// MQTT can be disabled by setting NEXT_PUBLIC_MQTT_ENABLED=false
const MQTT_ENABLED = process.env.NEXT_PUBLIC_MQTT_ENABLED !== "false";

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
  url: process.env.NEXT_PUBLIC_MQTT_URL ?? "wss://ws.ohvfx.com:8084/mqtt",
  username: process.env.NEXT_PUBLIC_MQTT_USERNAME ?? "xdx",
  password: process.env.NEXT_PUBLIC_MQTT_PASSWORD ?? "xdx12138",
} : undefined;

const STATE_TOPIC_PREFIX = normalizeTopic(
  process.env.NEXT_PUBLIC_MQTT_TOPIC_STATE_PREFIX,
  "state"
);

export const MQTT_TOPICS = {
  command: normalizeTopic(process.env.NEXT_PUBLIC_MQTT_TOPIC_COMMAND, "cmd"),
  control: normalizeTopic(process.env.NEXT_PUBLIC_MQTT_TOPIC_CONTROL, "quiz/control"),
  statePrefix: STATE_TOPIC_PREFIX,
  stateForClient(clientId: string) {
    return joinTopicSegments(STATE_TOPIC_PREFIX, clientId);
  },
};

export const FUSION_API_CONFIG = {
  baseUrl: process.env.NEXT_PUBLIC_FUSION_API_BASE ?? "https://api.ohvfx.com/fusion",
  token:
    process.env.NEXT_PUBLIC_FUSION_API_TOKEN ?? "uskOS7wIpVOyV6glpE7eOY6",
  spaceId: process.env.NEXT_PUBLIC_FUSION_SPACE_ID ?? "spch5h60Pobkk",
  eventNodeId:
    process.env.NEXT_PUBLIC_FUSION_EVENT_NODE_ID ?? "foduzcRW7MGLv",
};
