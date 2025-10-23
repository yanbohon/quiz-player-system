"use client";

import mqtt, { IClientOptions, IClientPublishOptions, MqttClient } from "mqtt";

type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface MqttConfig {
  url: string;
  username?: string;
  password?: string;
  clientId?: string;
  keepalive?: number;
  clean?: boolean;
  connectTimeout?: number;
  reconnectPeriod?: number;
  protocolVersion?: 4 | 5;
  will?: IClientOptions["will"];
}

export interface SubscribeOptions {
  qos?: 0 | 1 | 2;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

class MqttService {
  private client: MqttClient | null = null;
  private subscribers: Map<string, Set<(message: string) => void>> = new Map();
  private reconnectAttempts = 0;
  private isConnecting = false;
  private connectPromise: Promise<void> | null = null;
  private connectionListeners = new Set<(status: ConnectionStatus) => void>();

  private notifyConnectionStatus(status: ConnectionStatus) {
    this.connectionListeners.forEach((listener) => {
      try {
        listener(status);
      } catch (err) {
        console.error("Connection status listener failed", err);
      }
    });
  }

  onConnectionStatusChange(listener: (status: ConnectionStatus) => void): () => void {
    this.connectionListeners.add(listener);
    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  connect(config: MqttConfig): Promise<void> {
    if (this.client && this.client.connected) {
      console.log("MQTT already connected");
      this.notifyConnectionStatus("connected");
      return Promise.resolve();
    }

    if (this.isConnecting && this.connectPromise) {
      console.warn("MQTT connection already in progress");
      this.notifyConnectionStatus("connecting");
      return this.connectPromise;
    }

    this.connectPromise = new Promise((resolve, reject) => {
      let settled = false;
      let connectionTimeout: ReturnType<typeof setTimeout> | null = null;

      const clearPendingTimeout = () => {
        if (connectionTimeout !== null) {
          clearTimeout(connectionTimeout);
          connectionTimeout = null;
        }
      };

      const finalize = () => {
        clearPendingTimeout();
        this.isConnecting = false;
        this.connectPromise = null;
      };

      const resolveConnection = () => {
        this.reconnectAttempts = 0;
        finalize();
        if (settled) return;
        settled = true;
        resolve();
      };

      const rejectConnection = (error: Error) => {
        finalize();
        if (settled) return;
        settled = true;
        if (this.client && !this.client.connected) {
          this.client.end(true);
          this.client = null;
        }
        reject(error);
      };

      try {
        this.isConnecting = true;
        this.reconnectAttempts = 0;
        this.notifyConnectionStatus("connecting");

        const cleanSession = config.clean ?? true;

        const options: IClientOptions = {
          clientId:
            config.clientId || `contestant_${Math.random().toString(16).slice(2, 8)}`,
          clean: cleanSession,
          connectTimeout: config.connectTimeout ?? 30000,
          reconnectPeriod: config.reconnectPeriod ?? 5000,
          keepalive: config.keepalive ?? 60,
          protocolVersion: config.protocolVersion ?? 4,
          resubscribe: true,
          queueQoSZero: false,
        };

        if (!cleanSession && config.clientId) {
          options.clientId = config.clientId;
        }

        if (config.username) {
          options.username = config.username;
        }

        if (config.password) {
          options.password = config.password;
        }

        if (config.will) {
          options.will = config.will;
        }

        this.client = mqtt.connect(config.url, options);
        const client = this.client;

        if (!client) {
          throw new Error("Failed to initialize MQTT client");
        }

        const connectHandler = () => {
          console.log("MQTT connected successfully");
          this.notifyConnectionStatus("connected");
          resolveConnection();
        };

        const errorHandler = (error: Error) => {
          console.error("MQTT connection error:", error);
          if (this.reconnectAttempts === 0) {
            this.reconnectAttempts++;
            rejectConnection(error);
          }
        };

        const offlineHandler = () => {
          console.log("MQTT client offline");
          this.isConnecting = false;
          this.notifyConnectionStatus("disconnected");
        };

        const reconnectHandler = () => {
          this.reconnectAttempts++;
          console.log(`MQTT reconnecting... (attempt ${this.reconnectAttempts})`);
          this.notifyConnectionStatus("reconnecting");
        };

        const closeHandler = () => {
          console.log("MQTT connection closed");
          this.isConnecting = false;
          this.notifyConnectionStatus("disconnected");
          if (!settled) {
            rejectConnection(new Error("MQTT connection closed before establishing"));
          }
        };

        client.on("connect", connectHandler);
        client.on("error", errorHandler);
        client.on("offline", offlineHandler);
        client.on("reconnect", reconnectHandler);
        client.on("close", closeHandler);

        client.on("message", (topic, message) => {
          const messageStr = message.toString();
          const callbacks = this.subscribers.get(topic);
          if (callbacks) {
            callbacks.forEach((callback) => callback(messageStr));
          }
        });

        connectionTimeout = setTimeout(() => {
          if (this.isConnecting) {
            this.isConnecting = false;
            const timeoutError = new Error("MQTT connection timeout");
            console.error(timeoutError);
            this.notifyConnectionStatus("disconnected");
            if (!settled) {
              rejectConnection(timeoutError);
            }
          }
        }, 35000);

        client.once("connect", () => {
          clearPendingTimeout();
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.isConnecting = false;
        this.connectPromise = null;
        this.notifyConnectionStatus("disconnected");
        reject(err);
      }
    });

    return this.connectPromise;
  }

  subscribe(
    topic: string,
    callback: (message: string) => void,
    options?: SubscribeOptions
  ): () => void {
    const client = this.client;

    if (
      !client ||
      (client as MqttClient & { disconnecting?: boolean }).disconnecting ||
      !client.connected
    ) {
      console.warn(`Cannot subscribe to ${topic}: MQTT client not connected`);
      const error = new Error("MQTT client not connected");
      options?.onError?.(error);
      return () => {};
    }

    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, new Set());
      client.subscribe(
        topic,
        { qos: options?.qos ?? 0 },
        (err: Error | null) => {
          if (err) {
            console.error(`Failed to subscribe to ${topic}:`, err);
            options?.onError?.(err);
            return;
          }
          options?.onSuccess?.();
        }
      );
    } else if (options?.onSuccess) {
      queueMicrotask(() => options.onSuccess?.());
    }

    this.subscribers.get(topic)!.add(callback);

    return () => {
      const callbacks = this.subscribers.get(topic);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscribers.delete(topic);
          this.client?.unsubscribe(topic, undefined, (err?: Error) => {
            if (err) {
              console.error(`Failed to unsubscribe from ${topic}:`, err);
              options?.onError?.(err);
            }
          });
        }
      }
    };
  }

  publish(topic: string, message: string, options?: IClientPublishOptions): void {
    if (!this.client) {
      throw new Error("MQTT client not connected");
    }

    if (!this.client.connected) {
      console.warn(`Cannot publish to ${topic}: No connection to broker`);
      return;
    }

    this.client.publish(topic, message, options ?? { qos: 1 }, (err) => {
      if (err) {
        console.error(`Failed to publish to ${topic}:`, err);
      }
    });
  }

  disconnect(): void {
    if (this.client) {
      this.client.end();
      this.client = null;
      this.connectPromise = null;
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.subscribers.clear();
      this.notifyConnectionStatus("disconnected");
    }
  }

  isConnected(): boolean {
    return this.client?.connected || false;
  }
}

export const mqttService = new MqttService();
