import { ApiError } from "./api/client";
import { normalizeQuestion, NormalizedQuestion } from "./normalizeQuestion";
import { FUSION_API_CONFIG } from "@/config/control";
import { resolveTihaiUrl } from "@/config/api";

interface FusionResponse<T> {
  code: number;
  success: boolean;
  message?: string;
  data: T;
}

interface SpaceNodeChild {
  id?: string;
  name?: string;
  type?: string;
  icon?: string;
  isFav?: boolean;
  permission?: number;
}

interface SpaceNodeData {
  id?: string;
  name?: string;
  type?: string;
  children?: SpaceNodeChild[];
}

export interface FusionEventSummary {
  id: string;
  name: string;
  type: string;
  index: number;
  posterUrl?: string;
}

export interface DatasheetRecord {
  recordId?: string;
  fields?: Record<string, unknown>;
}

interface DatasheetResponse {
  total?: number;
  pageNum?: number;
  pageSize?: number;
  records?: DatasheetRecord[];
}

interface GrabQuestionResponse {
  success?: boolean;
  message?: string;
  question?: Record<string, unknown>;
  remainingCount?: number;
  [key: string]: unknown;
}

interface SubmitGrabAnswerResponse {
  success?: boolean;
  message?: string;
  result?: string;
  correctAnswer?: string | string[];
  score?: {
    total?: number;
    increment?: number;
    [key: string]: unknown;
  };
  stats?: {
    total?: number;
    correct?: number;
    wrong?: number;
    accuracy?: number;
    lastAnswerTime?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

type FusionFetchOptions = RequestInit & {
  timeoutMs?: number;
  retry?: number;
  retryDelayMs?: number;
};

const SUBMIT_MIN_INTERVAL_MS = 1000;
const SUBMIT_MAX_ATTEMPTS = 3;
const SUBMIT_BASE_RETRY_DELAY_MS = 500;
const SUBMIT_MAX_RETRY_DELAY_MS = 2500;
const DEFAULT_FETCH_TIMEOUT_MS = 5000;
const DEFAULT_FETCH_RETRY_DELAY_MS = 300;

const GRAB_MAX_ATTEMPTS = 3;
const GRAB_RETRY_DELAY_MS = 1000;
const GRAB_LOCK_TIMEOUT_MS = 2000;

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function computeRetryDelayMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
) {
  const safeAttempt = Math.max(attempt - 1, 0);
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** safeAttempt);
  const jitter = Math.floor(Math.random() * Math.max(200, exponential * 0.2));
  return exponential + jitter;
}

export type QuizApiErrorType = "network" | "business" | "timeout";

export class QuizApiError extends Error {
  constructor(
    public readonly type: QuizApiErrorType,
    message: string,
    public readonly suggestion: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "QuizApiError";
  }
}

export class QuestionPoolEmptyError extends QuizApiError {
  constructor(public readonly remainingCount?: number) {
    super(
      "business",
      "题目已经耗尽，无法继续抢题",
      "请联系主持人确认题库状态或等待下一轮",
      remainingCount
    );
    this.name = "QuestionPoolEmptyError";
  }
}

export class LockTimeoutError extends QuizApiError {
  constructor() {
    super(
      "timeout",
      "请求等待超时，可能存在其他抢题操作正在进行",
      "请稍后重试，如持续出现请联系工作人员"
    );
    this.name = "LockTimeoutError";
  }
}

function toQuizApiError(error: unknown): QuizApiError {
  if (error instanceof QuizApiError) {
    return error;
  }
  if (error instanceof ApiError) {
    return new QuizApiError(
      "business",
      error.message || "服务返回错误",
      "请联系工作人员或稍后重试",
      error
    );
  }
  if (error instanceof TypeError) {
    return new QuizApiError(
      "network",
      "网络异常，未能连接到服务器",
      "请检查网络连接后重试",
      error
    );
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new QuizApiError(
      "network",
      "请求被中断",
      "请确认网络状况后重新尝试",
      error
    );
  }
  return new QuizApiError(
    "business",
    error instanceof Error ? error.message : "未知错误",
    "请联系工作人员或稍后重试",
    error
  );
}

type GrabQuestionResult = {
  question?: NormalizedQuestion;
  remainingCount?: number;
};

async function fetchGrabbedQuestionRaw(userId: string): Promise<GrabQuestionResult> {
  const response = await fetch(resolveTihaiUrl("/grab-with-details"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId }),
  });

  let data: GrabQuestionResponse | undefined;
  try {
    data = await response.json();
  } catch {
    data = undefined;
  }

  if (!response.ok) {
    const message =
      typeof data?.message === "string" && data.message.trim()
        ? data.message
        : response.statusText || "请求失败";
    throw new ApiError(response.status, message, data);
  }

  if (data?.success === false) {
    const message =
      typeof data.message === "string" && data.message.trim()
        ? data.message
        : "题海取题失败";
    throw new ApiError(response.status, message, data);
  }

  const normalized = normalizeQuestion(data, "tihai");
  const question = normalized[0];
  const remainingCount =
    typeof data?.remainingCount === "number" ? data.remainingCount : undefined;
  if (!question) {
    throw new QuestionPoolEmptyError(remainingCount);
  }
  return { question, remainingCount };
}

async function submitGrabbedAnswerRaw(params: {
  userId: string;
  questionId: string;
  answer: string | string[];
  timeoutMs?: number;
}): Promise<SubmitGrabAnswerResponse> {
  const payload = {
    userId: params.userId,
    questionId: params.questionId,
    answer: params.answer,
  };

  const controller =
    typeof AbortController !== "undefined" &&
    typeof params.timeoutMs === "number" &&
    params.timeoutMs > 0
      ? new AbortController()
      : undefined;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  if (controller && typeof params.timeoutMs === "number") {
    timeoutHandle = setTimeout(() => {
      controller.abort();
    }, params.timeoutMs);
  }

  try {
    const response = await fetch(resolveTihaiUrl("/submit-answer"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });

    let data: SubmitGrabAnswerResponse | undefined;
    try {
      data = await response.json();
    } catch {
      data = undefined;
    }

    if (!response.ok) {
      const message =
        typeof data?.message === "string" && data.message.trim()
          ? data.message
          : response.statusText || "提交答案失败";
      throw new ApiError(response.status, message, data);
    }

    if (data?.success === false) {
      const message =
        typeof data.message === "string" && data.message.trim()
          ? data.message
          : "题海答题提交失败";
      throw new ApiError(response.status, message, data);
    }

    return data ?? { success: true };
  } catch (error) {
    if (error instanceof ApiError || error instanceof QuizApiError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new QuizApiError(
        "timeout",
        "提交等待超时",
        "提交结果暂未确认，请稍候查看题目状态，避免连续重复提交",
        error
      );
    }
    throw new QuizApiError(
      "network",
      error instanceof Error ? error.message || "提交答案失败" : "提交答案失败",
      "请检查网络连接后重试",
      error
    );
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export async function fusionFetch<T>(
  path: string,
  init?: FusionFetchOptions
): Promise<T> {
  const base = FUSION_API_CONFIG.baseUrl.replace(/\/$/, "");
  const url = path.startsWith("http")
    ? path
    : `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const {
    timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    retry = 0,
    retryDelayMs = DEFAULT_FETCH_RETRY_DELAY_MS,
    ...restInit
  } = init ?? {};

  const execute = async (): Promise<T> => {
    const shouldUseController =
      timeoutMs > 0 && typeof AbortController !== "undefined" && !restInit.signal;
    const controller = shouldUseController ? new AbortController() : undefined;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    if (controller && timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        controller.abort();
      }, timeoutMs);
    }

    try {
      const response = await fetch(url, {
        ...restInit,
        signal: controller?.signal ?? restInit.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${FUSION_API_CONFIG.token}`,
          ...(restInit.headers ?? {}),
        },
      });

      if (!response.ok) {
        const message = await response.text();
        throw new ApiError(response.status, message);
      }

      const json: FusionResponse<T> = await response.json();
      if (!json.success) {
        throw new ApiError(json.code ?? -1, json.message ?? "Fusion API Error", json);
      }

      return json.data;
    } catch (error) {
      if (error instanceof ApiError || error instanceof QuizApiError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new QuizApiError(
          "timeout",
          "请求等待超时",
          "请检查网络连接后重试",
          error
        );
      }
      throw new QuizApiError(
        "network",
        error instanceof Error ? error.message || "网络异常" : "网络异常",
        "请检查网络连接后重试",
        error
      );
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  };

  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retry) {
    try {
      return await execute();
    } catch (error) {
      lastError = error;
      if (
        attempt < retry &&
        error instanceof QuizApiError &&
        (error.type === "network" || error.type === "timeout")
      ) {
        if (retryDelayMs > 0) {
          await delay(retryDelayMs);
        }
        attempt += 1;
        continue;
      }
      throw error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error("Fusion request failed");
}

export async function fetchFusionEvents(): Promise<FusionEventSummary[]> {
  const path = `/v1/spaces/${FUSION_API_CONFIG.spaceId}/nodes/${FUSION_API_CONFIG.eventNodeId}`;
  const data = await fusionFetch<SpaceNodeData>(path);
  const children = Array.isArray(data.children) ? data.children : [];
  return children.map((item, index) => ({
    id: String(item.id ?? ""),
    name: String(item.name ?? `赛事${index + 1}`),
    type: String(item.type ?? ""),
    index,
  }));
}

export async function fetchDatasheetRecords(
  datasheetId: string,
  searchParams: Record<string, string> = { fieldKey: "name" }
): Promise<DatasheetRecord[]> {
  const params = new URLSearchParams(searchParams);
  const path = `/v1/datasheets/${datasheetId}/records?${params.toString()}`;
  const data = await fusionFetch<DatasheetResponse>(path);
  return Array.isArray(data.records) ? data.records : [];
}

export async function patchDatasheetRecords(
  datasheetId: string,
  payload: unknown
): Promise<void> {
  await fusionFetch(`/v1/datasheets/${datasheetId}/records`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function fetchNormalizedDatasheetQuestions(
  datasheetId: string
): Promise<NormalizedQuestion[]> {
  const records = await fetchDatasheetRecords(datasheetId);
  const wrapped = {
    data: {
      records,
    },
  };
  return normalizeQuestion(wrapped, "default");
}

let submitChain: Promise<SubmitGrabAnswerResponse> = Promise.resolve(
  { success: true } as SubmitGrabAnswerResponse
);
let submitLastAttemptAt = 0;

export async function submitGrabbedAnswer(params: {
  userId: string;
  questionId: string;
  answer: string | string[];
  timeoutMs?: number;
}): Promise<SubmitGrabAnswerResponse> {
  const execute = async () => {
    let attempt = 0;
    while (attempt < SUBMIT_MAX_ATTEMPTS) {
      attempt += 1;
      const now = Date.now();
      const waitMs = Math.max(0, SUBMIT_MIN_INTERVAL_MS - (now - submitLastAttemptAt));
      if (waitMs > 0) {
        await delay(waitMs);
      }
      submitLastAttemptAt = Date.now();

      try {
        return await submitGrabbedAnswerRaw(params);
      } catch (error) {
        const quizError = toQuizApiError(error);
        if (quizError.type !== "network" || attempt >= SUBMIT_MAX_ATTEMPTS) {
          throw quizError;
        }
        await delay(
          computeRetryDelayMs(
            attempt,
            SUBMIT_BASE_RETRY_DELAY_MS,
            SUBMIT_MAX_RETRY_DELAY_MS
          )
        );
      }
    }
    throw new QuizApiError(
      "network",
      "提交请求多次重试仍未成功",
      "请检查网络连接或联系工作人员"
    );
  };

  submitChain = submitChain.then(execute, execute);
  return submitChain;
}

let grabLockActive = false;
const grabWaiters: Array<() => void> = [];

function releaseGrabLock() {
  const next = grabWaiters.shift();
  if (next) {
    next();
  } else {
    grabLockActive = false;
  }
}

async function acquireGrabLock(): Promise<void> {
  if (!grabLockActive) {
    grabLockActive = true;
    return;
  }

  let resolveWaiter: (() => void) | undefined;
  const waitPromise = new Promise<void>((resolve) => {
    resolveWaiter = resolve;
    grabWaiters.push(resolve);
  });

  const timeoutPromise = delay(GRAB_LOCK_TIMEOUT_MS).then(() => "timeout" as const);
  const result = await Promise.race([waitPromise, timeoutPromise]);

  if (result === "timeout") {
    const index = grabWaiters.indexOf(resolveWaiter!);
    if (index >= 0) {
      grabWaiters.splice(index, 1);
    }
    throw new LockTimeoutError();
  }

  grabLockActive = true;
}

export async function fetchGrabbedQuestion(
  userId: string
): Promise<GrabQuestionResult> {
  await acquireGrabLock();

  try {
    let attempt = 0;
    while (attempt < GRAB_MAX_ATTEMPTS) {
      attempt += 1;

      try {
        return await fetchGrabbedQuestionRaw(userId);
      } catch (error) {
        const quizError = toQuizApiError(error);
        if (quizError instanceof QuestionPoolEmptyError) {
          throw quizError;
        }
        if (quizError.type !== "network" || attempt >= GRAB_MAX_ATTEMPTS) {
          throw quizError;
        }
        await delay(GRAB_RETRY_DELAY_MS);
      }
    }
    throw new QuizApiError(
      "network",
      "抢题请求多次重试仍未成功",
      "请检查网络连接或联系工作人员"
    );
  } finally {
    releaseGrabLock();
  }
}

interface AttachmentUploadData {
  token?: string;
  url?: string;
  [key: string]: unknown;
}

interface AttachmentUploadResponse {
  code?: number;
  message?: string;
  data?: AttachmentUploadData;
  token?: string;
  url?: string;
  [key: string]: unknown;
}

export interface UploadAttachmentResult {
  token: string;
  url?: string;
  data?: AttachmentUploadData;
  raw: AttachmentUploadResponse;
}

export async function uploadDatasheetAttachment(
  datasheetId: string,
  file: Blob | File,
  filename?: string
): Promise<UploadAttachmentResult> {
  if (!datasheetId) {
    throw new Error("缺少题库表 ID，无法上传附件");
  }

  const base = FUSION_API_CONFIG.baseUrl.replace(/\/$/, "");
  const endpoint = `${base}/v1/datasheets/${datasheetId}/attachments`;
  const formData = new FormData();

  const resolvedName =
    filename ??
    (file instanceof File && file.name ? file.name : "sketch-answer.png");

  if (file instanceof File) {
    formData.append("file", file, resolvedName);
  } else {
    formData.append("file", file, resolvedName);
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FUSION_API_CONFIG.token}`,
      Accept: "application/json",
    },
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new ApiError(response.status, message);
  }

  const payload: AttachmentUploadResponse = await response
    .json()
    .catch(() => ({}));

  const data = payload.data ?? {};
  const tokenCandidate =
    (typeof data.token === "string" && data.token.trim()) ||
    (typeof data.url === "string" && data.url.trim()) ||
    (typeof payload.token === "string" && payload.token.trim()) ||
    (typeof payload.url === "string" && payload.url.trim());

  if (!tokenCandidate) {
    throw new ApiError(
      payload.code ?? 200,
      "附件上传成功但未返回 token",
      payload
    );
  }

  return {
    token: tokenCandidate,
    url:
      typeof data.url === "string" && data.url.trim()
        ? data.url.trim()
        : typeof payload.url === "string" && payload.url.trim()
        ? payload.url.trim()
        : undefined,
    data,
    raw: payload,
  };
}
