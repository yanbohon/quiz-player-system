import mqtt from "mqtt";
import {
  BROKER_PASSWORD,
  BROKER_URL,
  BROKER_USERNAME,
} from "./broker-env";

type PublishOptions = {
  topic: string;
  payload: string;
  qos?: 0 | 1 | 2;
  retain?: boolean;
};

type WaitForMessageOptions = {
  topic: string;
  predicate?: (payload: string) => boolean;
  timeoutMs?: number;
  qos?: 0 | 1 | 2;
  afterSubscribe?: () => Promise<void> | void;
};

type CollectMessagesOptions = {
  topic: string;
  count: number;
  predicate?: (payload: string) => boolean;
  timeoutMs?: number;
  qos?: 0 | 1 | 2;
  afterSubscribe?: () => Promise<void> | void;
};

function normalizeError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

export async function publishLiveMqttMessage({
  topic,
  payload,
  qos = 1,
  retain = false,
}: PublishOptions) {
  const clientId = `e2e-publisher-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2, 8)}`;

  await new Promise<void>((resolve, reject) => {
    const client = mqtt.connect(BROKER_URL, {
      username: BROKER_USERNAME,
      password: BROKER_PASSWORD,
      clientId,
      protocolVersion: 4,
      connectTimeout: 20_000,
      reconnectPeriod: 0,
      clean: true,
    });

    let settled = false;

    const finalize = (callback?: () => void) => {
      client.removeAllListeners();
      client.end(true, callback);
    };

    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      finalize(() => reject(error));
    };

    client.once("error", (error) => {
      rejectOnce(error);
    });

    client.once("connect", () => {
      client.publish(topic, payload, { qos, retain }, (error) => {
        if (settled) return;
        if (error) {
          rejectOnce(error);
          return;
        }
        settled = true;
        finalize(resolve);
      });
    });
  });
}

export async function waitForLiveMqttMessage({
  topic,
  predicate,
  timeoutMs = 20_000,
  qos = 1,
  afterSubscribe,
}: WaitForMessageOptions) {
  const clientId = `e2e-subscriber-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2, 8)}`;

  return await new Promise<string>((resolve, reject) => {
    const client = mqtt.connect(BROKER_URL, {
      username: BROKER_USERNAME,
      password: BROKER_PASSWORD,
      clientId,
      protocolVersion: 4,
      connectTimeout: timeoutMs,
      reconnectPeriod: 0,
      clean: true,
    });

    let settled = false;

    const timeout = setTimeout(() => {
      rejectOnce(new Error(`Timed out waiting for MQTT message on ${topic}`));
    }, timeoutMs);

    const finalize = (callback?: () => void) => {
      clearTimeout(timeout);
      client.removeAllListeners();
      client.end(true, callback);
    };

    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      finalize(() => reject(error));
    };

    const resolveOnce = (payload: string) => {
      if (settled) return;
      settled = true;
      finalize(() => resolve(payload));
    };

    client.once("error", (error) => {
      rejectOnce(error);
    });

    client.on("message", (incomingTopic, message) => {
      if (incomingTopic !== topic) return;
      const payload = message.toString();
      if (predicate && !predicate(payload)) return;
      resolveOnce(payload);
    });

    client.once("connect", () => {
      client.subscribe(topic, { qos }, async (error) => {
        if (error) {
          rejectOnce(error);
          return;
        }

        if (!afterSubscribe) return;

        try {
          await afterSubscribe();
        } catch (subscribeError) {
          rejectOnce(normalizeError(subscribeError));
        }
      });
    });
  });
}

export async function collectLiveMqttMessages({
  topic,
  count,
  predicate,
  timeoutMs = 20_000,
  qos = 1,
  afterSubscribe,
}: CollectMessagesOptions) {
  const expectedCount = Math.max(1, Math.trunc(count));
  const clientId = `e2e-collector-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2, 8)}`;

  return await new Promise<string[]>((resolve, reject) => {
    const client = mqtt.connect(BROKER_URL, {
      username: BROKER_USERNAME,
      password: BROKER_PASSWORD,
      clientId,
      protocolVersion: 4,
      connectTimeout: timeoutMs,
      reconnectPeriod: 0,
      clean: true,
    });

    let settled = false;
    const messages: string[] = [];

    const timeout = setTimeout(() => {
      rejectOnce(
        new Error(
          `Timed out waiting for ${expectedCount} MQTT messages on ${topic}; received ${messages.length}`
        )
      );
    }, timeoutMs);

    const finalize = (callback?: () => void) => {
      clearTimeout(timeout);
      client.removeAllListeners();
      client.end(true, callback);
    };

    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      finalize(() => reject(error));
    };

    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      finalize(() => resolve([...messages]));
    };

    client.once("error", (error) => {
      rejectOnce(error);
    });

    client.on("message", (incomingTopic, message) => {
      if (incomingTopic !== topic) return;
      const payload = message.toString();
      if (predicate && !predicate(payload)) return;
      messages.push(payload);
      if (messages.length >= expectedCount) {
        resolveOnce();
      }
    });

    client.once("connect", () => {
      client.subscribe(topic, { qos }, async (error) => {
        if (error) {
          rejectOnce(error);
          return;
        }

        if (!afterSubscribe) return;

        try {
          await afterSubscribe();
        } catch (subscribeError) {
          rejectOnce(normalizeError(subscribeError));
        }
      });
    });
  });
}
