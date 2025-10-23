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

export async function fusionFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const base = FUSION_API_CONFIG.baseUrl.replace(/\/$/, "");
  const url = path.startsWith("http")
    ? path
    : `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FUSION_API_CONFIG.token}`,
      ...init?.headers,
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

export async function fetchGrabbedQuestion(
  userId: string
): Promise<{ question?: NormalizedQuestion; remainingCount?: number }> {
  const response = await fetch(
    resolveTihaiUrl("/grab-with-details"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId }),
    }
  );

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
  return { question, remainingCount };
}

export async function submitGrabbedAnswer(params: {
  userId: string;
  questionId: string;
  answer: string | string[];
}): Promise<SubmitGrabAnswerResponse> {
  const payload = {
    userId: params.userId,
    questionId: params.questionId,
    answer: params.answer,
  };

  const response = await fetch(resolveTihaiUrl("/submit-answer"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
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
