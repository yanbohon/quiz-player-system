export interface NormalizedQuestion {
  id: string;
  type: string;
  content: string;
  options: Array<{ text: string; value: string }>;
  answer: string[];
  explanation?: string;
  difficulty?: number;
  packId?: string;
  audioUrl?: string;
  recordId?: string;
  raw?: Record<string, unknown>;
  source: "tihai" | "default";
}

export function normalizeQuestion(
  raw: unknown,
  source: "tihai" | "default"
): NormalizedQuestion[] {
  if (source === "tihai") {
    const payload = asObject(raw);
    const q = asObject(payload?.question);
    return [
      {
        id: String(q?.id ?? payload?.questionId ?? ""),
        type: String(q?.type ?? ""),
        content: String(q?.title ?? ""),
        options: extractTiHaiOptions(q?.options),
        answer: normalizeAnswerValue(q?.answer),
        explanation: typeof q?.explanation === "string" ? q.explanation : undefined,
        difficulty:
          typeof q?.difficulty === "number" ? q.difficulty : undefined,
        packId: q?.packId ? String(q.packId) : undefined,
        audioUrl: typeof q?.audioUrl === "string" ? q.audioUrl : undefined,
        recordId: deriveRecordId(q?.id, payload?.questionId),
        raw: cloneRecord(q),
        source: "tihai",
      },
    ];
  }

  const records = extractDefaultRecords(raw);
  return records.map((record) => {
    const fields = asObject(record.fields);
    const options = parseOptions(
      typeof fields?.options === "string" ? fields.options : undefined
    );
    const audioCandidate = Array.isArray(fields?.audio)
      ? extractFirstUrl(fields.audio)
      : fields?.url;
    return {
      id: String(fields?.ID ?? record.recordId ?? ""),
      type: String(fields?.type ?? ""),
      content: String(fields?.stem ?? ""),
      options,
      answer: normalizeAnswerValue(fields?.answer),
      explanation: undefined,
      difficulty: undefined,
      audioUrl: audioCandidate ? String(audioCandidate) : undefined,
      packId: undefined,
      recordId:
        record.recordId !== undefined
          ? String(record.recordId)
          : fields?.ID !== undefined
            ? String(fields.ID)
            : undefined,
      raw: cloneRecord(fields),
      source: "default",
    } as NormalizedQuestion;
  });
}

function parseOptions(
  rawOptions: string | undefined | null
): Array<{ text: string; value: string }> {
  if (!rawOptions) return [];
  return rawOptions
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const match = line.trim().match(/^([A-Z])[\s．。\.、，)）-]*?(.*)$/);
      if (match) {
        const [, value, text] = match;
        const label = sanitizeOptionText(text, value);
        return { value, text: label };
      }
      return { value: "", text: sanitizeOptionText(line) };
    });
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return null;
}

function extractTiHaiOptions(
  rawOptions: unknown
): Array<{ text: string; value: string }> {
  if (!Array.isArray(rawOptions)) return [];
  return rawOptions.map((item) => {
    const option = asObject(item);
    const rawValue = String(option?.value ?? "");
    const rawText = String(option?.text ?? "");
    return {
      text: sanitizeOptionText(rawText, rawValue || undefined),
      value: rawValue,
    };
  });
}

interface DefaultRecord {
  recordId?: unknown;
  fields?: unknown;
}

function extractDefaultRecords(raw: unknown): Array<DefaultRecord> {
  const container = asObject(raw);
  const data = asObject(container?.data);
  const records = Array.isArray(data?.records)
    ? (data.records as unknown[])
    : [];
  return records.map((record) => {
    const recordObj = asObject(record);
    return {
      recordId: recordObj?.recordId,
      fields: recordObj?.fields,
    };
  });
}

function extractFirstUrl(list: unknown[]): string | undefined {
  for (const item of list) {
    const obj = asObject(item);
    if (obj?.url) {
      return String(obj.url);
    }
  }
  return undefined;
}

function deriveRecordId(
  primary: unknown,
  fallback: unknown
): string | undefined {
  if (primary !== undefined && primary !== null && String(primary)) {
    return String(primary);
  }
  if (fallback !== undefined && fallback !== null && String(fallback)) {
    return String(fallback);
  }
  return undefined;
}

function cloneRecord(
  input: Record<string, unknown> | null
): Record<string, unknown> | undefined {
  if (!input) return undefined;
  return { ...input };
}

function normalizeAnswerValue(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item)).filter(Boolean);
  }

  if (raw === undefined || raw === null) {
    return [];
  }

  const rawString = String(raw).trim();
  if (!rawString) return [];

  if (rawString.startsWith("[") && rawString.endsWith("]")) {
    try {
      const parsed = JSON.parse(rawString);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item)).filter(Boolean);
      }
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Failed to parse answer JSON", error);
      }
    }
  }

  if (rawString.includes(",") || rawString.includes("，")) {
    return rawString
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return rawString.split("").filter(Boolean);
}

function sanitizeOptionText(raw: string, leadingKey?: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const targetKey = leadingKey && leadingKey.length > 0 ? leadingKey : trimmed.charAt(0);
  const escapedKey = targetKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const markerRegex = new RegExp(
    `^${escapedKey}[\\s\\.．。:：、，,\\-\\)）]+(.+)$`,
    "i"
  );

  const match = markerRegex.exec(trimmed);
  if (match && match[1]) {
    return match[1].trim();
  }

  const genericRegex = /^([A-Za-z0-9]+)[\s\\.．。:：、，,\-\\)）]+(.*)$/;
  const genericMatch = genericRegex.exec(trimmed);
  if (genericMatch && genericMatch[2]) {
    return genericMatch[2].trim();
  }

  const punctuationTrimmed = trimmed.replace(/^[\\s\\.．。:：、，,\\-\\)）]+/, "").trim();
  if (punctuationTrimmed && punctuationTrimmed !== trimmed) {
    return punctuationTrimmed;
  }

  return trimmed;
}
