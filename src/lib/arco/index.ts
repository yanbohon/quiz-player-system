"use client";

import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  Toast as ArcoToast,
  Dialog as ArcoDialog,
  Masking as ArcoMasking,
  Popup as ArcoPopup,
  ActionSheet as ArcoActionSheet,
  Notify as ArcoNotify,
} from "@arco-design/mobile-react";

/**
 * ArcoDesign Mobile React 19 适配工具
 * 
 * React 19 修改了 createRoot 的引入路径，所有浮层组件方法调用时需要手动传入 createRoot
 * 官方文档: https://arco.design/mobile/react
 * 
 * 包含组件：Toast、Dialog、Masking、Popup、ActionSheet
 */

// 类型定义
type DialogConfig = Record<string, unknown>;
type MaskingConfig = Record<string, unknown>;
type PopupConfig = Record<string, unknown>;
type ActionSheetConfig = {
  items: unknown[];
  [key: string]: unknown;
};
type NotifyOptions = {
  content?: ReactNode;
  duration?: number;
  onClose?: () => void;
  getContainer?: () => HTMLElement;
  [key: string]: unknown;
};
type NotifyConfig = string | NotifyOptions;

const NOTIFY_HOST_ID = "arco-notify-host";
let notifyContainerResolver: (() => HTMLElement | null | undefined) | null = null;

export function registerNotifyContainer(resolver?: () => HTMLElement | null) {
  if (resolver) {
    notifyContainerResolver = resolver;
  } else {
    notifyContainerResolver = null;
  }
}

function ensureNotifyHost() {
  if (typeof window === "undefined") return undefined;
  let host = document.getElementById(NOTIFY_HOST_ID) as HTMLDivElement | null;
  if (!host) {
    host = document.createElement("div");
    host.id = NOTIFY_HOST_ID;
    Object.assign(host.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      zIndex: "1100",
      pointerEvents: "none",
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
    });
    document.body.appendChild(host);
  }
  return host;
}

function normalizeNotifyConfig(config: NotifyConfig) {
  const base: NotifyOptions =
    typeof config === "string" ? { content: config } : { ...config };
  if (typeof window !== "undefined" && !base.getContainer) {
    const customContainer = notifyContainerResolver?.();
    const host = customContainer ?? ensureNotifyHost();
    if (host) {
      base.getContainer = () => host as HTMLElement;
    }
  }
  return base;
}

/**
 * Toast 轻提示
 */
export const Toast = {
  /**
   * 显示普通提示
   */
  toast: (content: string, duration?: number) => {
    if (typeof window === "undefined") return;
    return ArcoToast.toast({ content, duration }, { createRoot });
  },

  /**
   * 显示信息提示（与 toast 相同）
   */
  info: (content: string, duration?: number) => {
    if (typeof window === "undefined") return;
    return ArcoToast.info({ content, duration }, { createRoot });
  },

  /**
   * 显示成功提示
   */
  success: (content: string, duration?: number) => {
    if (typeof window === "undefined") return;
    return ArcoToast.success({ content, duration }, { createRoot });
  },

  /**
   * 显示错误提示
   */
  error: (content: string, duration?: number) => {
    if (typeof window === "undefined") return;
    return ArcoToast.error({ content, duration }, { createRoot });
  },

  /**
   * 显示警告提示
   */
  warn: (content: string, duration?: number) => {
    if (typeof window === "undefined") return;
    return ArcoToast.warn({ content, duration }, { createRoot });
  },

  /**
   * 显示加载提示
   */
  loading: (content: string, duration?: number) => {
    if (typeof window === "undefined") return;
    return ArcoToast.loading({ content, duration }, { createRoot });
  },
};

/**
 * Dialog 对话框
 */
export const Dialog = {
  /**
   * 显示警告框
   */
  alert: (config: DialogConfig) => {
    if (typeof window === "undefined") return;
    return ArcoDialog.alert(config, { createRoot });
  },

  /**
   * 显示确认框
   */
  confirm: (config: DialogConfig) => {
    if (typeof window === "undefined") return;
    return ArcoDialog.confirm(config, { createRoot });
  },

  /**
   * 打开对话框
   */
  open: (config: DialogConfig) => {
    if (typeof window === "undefined") return;
    return ArcoDialog.open(config, { createRoot });
  },
};

/**
 * Masking 图片预览/蒙层
 */
export const Masking = {
  /**
   * 打开蒙层
   */
  open: (config: MaskingConfig) => {
    if (typeof window === "undefined") return;
    return ArcoMasking.open(config, { createRoot });
  },
};

/**
 * Popup 弹出层
 */
export const Popup = {
  /**
   * 打开弹出层
   */
  open: (config: PopupConfig) => {
    if (typeof window === "undefined") return;
    return ArcoPopup.open(config, { createRoot });
  },
};

/**
 * ActionSheet 动作面板
 */
export const ActionSheet = {
  /**
   * 打开动作面板
   */
  open: (config: ActionSheetConfig) => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ArcoActionSheet.open(config as any, { createRoot });
  },
};

/**
 * Notify 消息通知
 */
export const Notify = {
  info: (config: NotifyConfig) => {
    if (typeof window === "undefined") return;
    return ArcoNotify.info(normalizeNotifyConfig(config), { createRoot });
  },
  success: (config: NotifyConfig) => {
    if (typeof window === "undefined") return;
    return ArcoNotify.success(normalizeNotifyConfig(config), { createRoot });
  },
  error: (config: NotifyConfig) => {
    if (typeof window === "undefined") return;
    return ArcoNotify.error(normalizeNotifyConfig(config), { createRoot });
  },
  warn: (config: NotifyConfig) => {
    if (typeof window === "undefined") return;
    return ArcoNotify.warn(normalizeNotifyConfig(config), { createRoot });
  },
};
