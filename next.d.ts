/// <reference types="next" />
/// <reference types="next/image-types/global" />

declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_API_URL?: string;
    NEXT_PUBLIC_API_BASE_URL?: string;
    NEXT_PUBLIC_TIHAI_API_BASE?: string;
    NEXT_PUBLIC_MQTT_URL?: string;
    NEXT_PUBLIC_MQTT_USERNAME?: string;
    NEXT_PUBLIC_MQTT_PASSWORD?: string;
    NEXT_PUBLIC_APP_NAME?: string;
    NEXT_PUBLIC_APP_VERSION?: string;
    NEXT_PUBLIC_DEBUG?: string;
  }
}
