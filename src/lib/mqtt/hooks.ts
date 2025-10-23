"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IClientPublishOptions } from "mqtt";
import { mqttService, MqttConfig } from "./client";

export function useMqtt(config?: MqttConfig) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const skippedStrictCleanupRef = useRef(process.env.NODE_ENV !== "production");

  useEffect(() => {
    if (!config) {
      setIsConnected(false);
      setIsConnecting(false);
      mqttService.disconnect();
      return;
    }

    let mounted = true;
    setIsConnecting(true);
    setError(null);
    setIsConnected(false);

    const unsubscribeStatus = mqttService.onConnectionStatusChange((status) => {
      if (!mounted) return;
      switch (status) {
        case "connected":
          setIsConnected(true);
          setIsConnecting(false);
          setError(null);
          break;
        case "connecting":
        case "reconnecting":
          setIsConnected(false);
          setIsConnecting(true);
          break;
        case "disconnected":
          setIsConnected(false);
          setIsConnecting(false);
          break;
        default:
          break;
      }
    });

    const connect = async () => {
      if (!mounted) return;

      try {
        await mqttService.connect(config);
      } catch (err) {
        if (!mounted) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setIsConnected(false);
        setIsConnecting(false);
        console.warn("MQTT connection failed, app will continue without real-time updates:", error.message);
      }
    };

    void connect();

    return () => {
      mounted = false;
      unsubscribeStatus();
      if (skippedStrictCleanupRef.current) {
        skippedStrictCleanupRef.current = false;
        return;
      }
      mqttService.disconnect();
      setIsConnected(false);
      setIsConnecting(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const subscribe = useCallback(
    (
      topic: string,
      callback: (message: string) => void,
      options?: Parameters<typeof mqttService.subscribe>[2]
    ) => {
      if (!isConnected) {
        console.warn("MQTT not connected, cannot subscribe");
        return () => {};
      }
      return mqttService.subscribe(topic, callback, options);
    },
    [isConnected]
  );

  const publish = useCallback(
    (topic: string, message: string, options?: IClientPublishOptions) => {
      if (!isConnected) {
        console.warn("MQTT not connected, cannot publish");
        return;
      }
      mqttService.publish(topic, message, options);
    },
    [isConnected]
  );

  return {
    isConnected,
    isConnecting,
    error,
    subscribe,
    publish,
  };
}

export interface MqttSubscriptionMessage {
  payload: string;
  timestamp: number;
}

export function useMqttSubscription(topic: string, enabled = true) {
  const [message, setMessage] = useState<MqttSubscriptionMessage | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) {
      setMessage(null);
      if (retryRef.current) {
        clearTimeout(retryRef.current);
        retryRef.current = null;
      }
      return;
    }

    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    const subscribeWhenReady = () => {
      if (!mounted) return;

      if (!mqttService.isConnected()) {
        retryRef.current = setTimeout(subscribeWhenReady, 500);
        return;
      }

      try {
        unsubscribe = mqttService.subscribe(
          topic,
          (msg) => {
            setMessage({
              payload: msg,
              timestamp: Date.now(),
            });
          },
          { qos: 0 }
        );
      } catch (error) {
        console.warn(`Failed to subscribe to ${topic}:`, error);
        retryRef.current = setTimeout(subscribeWhenReady, 1000);
      }
    };

    subscribeWhenReady();

    return () => {
      mounted = false;
      if (retryRef.current) {
        clearTimeout(retryRef.current);
        retryRef.current = null;
      }
      unsubscribe?.();
    };
  }, [topic, enabled]);

  return message;
}
