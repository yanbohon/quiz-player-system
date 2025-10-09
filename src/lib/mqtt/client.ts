"use client";

import mqtt, { IClientOptions, IClientPublishOptions, MqttClient } from "mqtt";

export interface MqttConfig {
  url: string;
  username?: string;
  password?: string;
  clientId?: string;
  keepalive?: number;
  clean?: boolean;
  connectTimeout?: number;
  reconnectPeriod?: number;
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
  private maxReconnectAttempts = 5;
  private isConnecting = false;
  private connectPromise: Promise<void> | null = null;

  connect(config: MqttConfig): Promise<void> {
    if (this.client && this.client.connected) {
      console.log("MQTT already connected");
      return Promise.resolve();
    }

    if (this.isConnecting && this.connectPromise) {
      console.warn("MQTT connection already in progress");
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

      const resolveConnection = () => {
        if (settled) return;
        settled = true;
        clearPendingTimeout();
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        this.connectPromise = null;
        resolve();
      };

      const rejectConnection = (error: Error) => {
        if (settled) return;
        settled = true;
        clearPendingTimeout();
        this.isConnecting = false;
        this.connectPromise = null;
        if (this.client && !this.client.connected) {
          this.client.end(true);
          this.client = null;
        }
        reject(error);
      };

      try {
        this.isConnecting = true;
        this.reconnectAttempts = 0;

        const options: IClientOptions = {
          clientId:
            config.clientId || `contestant_${Math.random().toString(16).slice(2, 8)}`,
          clean: config.clean ?? true,
          connectTimeout: config.connectTimeout ?? 30000,
          reconnectPeriod: config.reconnectPeriod ?? 5000,
          keepalive: config.keepalive ?? 60,
          protocolVersion: 4,
          // Add these options for better WebSocket compatibility
          resubscribe: true,
          queueQoSZero: false,
        };

        if (!config.clean && config.clientId) {
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

        // Set up event handlers
        const connectHandler = () => {
          console.log("MQTT connected successfully");
          resolveConnection();
        };

        const errorHandler = (error: Error) => {
          console.error("MQTT connection error:", error);
          
          // Only reject on initial connection attempt
          if (this.reconnectAttempts === 0) {
            this.reconnectAttempts++;
            rejectConnection(error);
          }
        };

        const offlineHandler = () => {
          console.log("MQTT client offline");
          this.isConnecting = false;
        };

        const reconnectHandler = () => {
          this.reconnectAttempts++;
          console.log(`MQTT reconnecting... (attempt ${this.reconnectAttempts})`);
          
          // Stop reconnecting after max attempts
          if (this.reconnectAttempts >= this.maxReconnectAttempts && client) {
            console.warn("Max reconnection attempts reached, stopping reconnect");
            client.end(true);
          }
        };

        const closeHandler = () => {
          console.log("MQTT connection closed");
          this.isConnecting = false;
          if (!settled) {
            rejectConnection(new Error("MQTT connection closed before establishing"));
          }
        };

        client.on("connect", connectHandler);
        client.on("error", errorHandler);
        client.on("offline", offlineHandler);
        client.on("reconnect", reconnectHandler);

        client.on("message", (topic, message) => {
          const messageStr = message.toString();
          const callbacks = this.subscribers.get(topic);
          if (callbacks) {
            callbacks.forEach((callback) => callback(messageStr));
          }
        });

        client.on("close", closeHandler);

        // Set a timeout to reject if connection takes too long
        connectionTimeout = setTimeout(() => {
          if (this.isConnecting) {
            this.isConnecting = false;
            const timeoutError = new Error("MQTT connection timeout");
            console.error(timeoutError);
            if (!settled) {
              rejectConnection(timeoutError);
            }
          }
        }, 35000);

        // Clear timeout on successful connect
        client.once("connect", () => {
          clearPendingTimeout();
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.isConnecting = false;
        this.connectPromise = null;
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
    if (!this.client) {
      throw new Error("MQTT client not connected");
    }

    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, new Set());
      this.client.subscribe(
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
      // Already subscribed; invoke success immediately so callers can proceed
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
    }
  }

  isConnected(): boolean {
    return this.client?.connected || false;
  }
}

export const mqttService = new MqttService();
