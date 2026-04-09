function normalizeTopicSegment(value: string | undefined, fallback: string) {
  const resolved = value?.trim() || fallback;
  return resolved.replace(/^\/+/, "").replace(/\/+$/, "");
}

export function resolveBrokerEnv(
  env: NodeJS.ProcessEnv = process.env
) {
  const namespace =
    env.PLAYWRIGHT_BROKER_NAMESPACE ?? "contestant-app-e2e-live";

  const statePrefix = normalizeTopicSegment(
    env.PLAYWRIGHT_BROKER_STATE_PREFIX,
    `state/${namespace}`
  );

  return {
    BROKER_URL: env.PLAYWRIGHT_BROKER_URL ?? "wss://ws.ohvfx.com:8084/mqtt",
    BROKER_USERNAME: env.PLAYWRIGHT_BROKER_USERNAME ?? "1001",
    BROKER_PASSWORD: env.PLAYWRIGHT_BROKER_PASSWORD ?? "1001",
    BROKER_NAMESPACE: namespace,
    BROKER_COMMAND_TOPIC: normalizeTopicSegment(
      env.PLAYWRIGHT_BROKER_COMMAND_TOPIC,
      `cmd/${namespace}`
    ),
    BROKER_CONTROL_TOPIC: normalizeTopicSegment(
      env.PLAYWRIGHT_BROKER_CONTROL_TOPIC,
      `quiz/control/${namespace}`
    ),
    BROKER_RESULT_TOPIC: normalizeTopicSegment(
      env.PLAYWRIGHT_BROKER_RESULT_TOPIC,
      `quiz/result/${namespace}`
    ),
    BROKER_BUZZ_IN_TOPIC: normalizeTopicSegment(
      env.PLAYWRIGHT_BROKER_BUZZ_IN_TOPIC,
      `quiz/buzz_in/${namespace}`
    ),
    BROKER_STATE_PREFIX: statePrefix,
  };
}

const resolvedBrokerEnv = resolveBrokerEnv();

export const BROKER_URL = resolvedBrokerEnv.BROKER_URL;
export const BROKER_USERNAME = resolvedBrokerEnv.BROKER_USERNAME;
export const BROKER_PASSWORD = resolvedBrokerEnv.BROKER_PASSWORD;
export const BROKER_NAMESPACE = resolvedBrokerEnv.BROKER_NAMESPACE;
export const BROKER_COMMAND_TOPIC = resolvedBrokerEnv.BROKER_COMMAND_TOPIC;
export const BROKER_CONTROL_TOPIC = resolvedBrokerEnv.BROKER_CONTROL_TOPIC;
export const BROKER_RESULT_TOPIC = resolvedBrokerEnv.BROKER_RESULT_TOPIC;
export const BROKER_BUZZ_IN_TOPIC = resolvedBrokerEnv.BROKER_BUZZ_IN_TOPIC;
export const BROKER_STATE_PREFIX = resolvedBrokerEnv.BROKER_STATE_PREFIX;

export function brokerStateTopicForClient(clientId: string) {
  return `${BROKER_STATE_PREFIX}/${clientId.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}
