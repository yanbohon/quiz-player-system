/**
 * 应用常量定义
 */

// 题目类型
export const QUESTION_TYPES = {
  SINGLE: "single",
  MULTIPLE: "multiple",
  TRUE_FALSE: "true-false",
  TEXT: "text",
} as const;

// 比赛状态
export const CONTEST_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  FINISHED: "finished",
} as const;

// 本地存储键名
export const STORAGE_KEYS = {
  AUTH_TOKEN: "auth_token",
  USER_INFO: "user_info",
  ANSWERS_CACHE: "answers_cache",
} as const;

// API 端点
export const API_ENDPOINTS = {
  LOGIN: "/auth/login",
  LOGOUT: "/auth/logout",
  QUESTIONS: "/questions",
  SUBMIT_ANSWER: "/answers",
  USER_PROFILE: "/user/profile",
} as const;

// 时间常量（毫秒）
export const TIME = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
} as const;

export { MQTT_TOPICS } from "@/config/control";
