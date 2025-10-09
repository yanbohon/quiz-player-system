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
        answer: Array.isArray(q?.answer)
          ? q.answer.map((item) => String(item))
          : String(q?.answer ?? "")
              .split("")
              .filter(Boolean),
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
      answer: String(fields?.answer ?? "")
        .split("")
        .filter(Boolean),
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
      const match = line.match(/^([A-Z])、?(.*)$/);
      if (match) {
        const [, value, text] = match;
        return { value, text: text.trim() };
      }
      return { value: "", text: line.trim() };
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
    return {
      text: String(option?.text ?? ""),
      value: String(option?.value ?? ""),
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
