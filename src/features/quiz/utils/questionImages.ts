import type { NormalizedQuestion } from "@/lib/normalizeQuestion";
import type {
  CustomOceanQuestion,
  QuizQuestion,
  StandardQuestion,
  StandardQuestionOption,
} from "@/features/quiz/types";

export interface QuestionImageEntry {
  thumb: string;
  large: string;
}

export const QUESTION_IMAGE_EXTENSION_PATTERN = /\.(?:jpe?g|png|gif|bmp|webp|avif|svg)$/i;
export const QUESTION_IMAGE_CDN_HOST = "cdn.ohvfx.com";

export function isValidImageUrlCandidate(candidate: unknown): candidate is string {
  if (typeof candidate !== "string") {
    return false;
  }
  const trimmed = candidate.trim();
  if (!trimmed) {
    return false;
  }
  if (/^data:image\//i.test(trimmed)) {
    return true;
  }
  const sanitized = trimmed.split(/[?#]/)[0];
  return QUESTION_IMAGE_EXTENSION_PATTERN.test(sanitized.toLowerCase());
}

export function normalizeQuestionImageUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  if (/^data:image\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, "https://");
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  const normalized = trimmed.replace(/^\/+/, "");
  return `https://${QUESTION_IMAGE_CDN_HOST}/${normalized}`;
}

export function parseQuestionImageList(raw: unknown): QuestionImageEntry[] {
  if (raw === undefined || raw === null) {
    return [];
  }

  let payload: unknown = raw;
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) {
      return [];
    }
    try {
      payload = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(payload)) {
    return [];
  }

  const entries: QuestionImageEntry[] = [];
  for (const item of payload) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const thumbCandidate = record.thumb;
    const largeCandidate = record.large;
    if (
      !isValidImageUrlCandidate(thumbCandidate) ||
      !isValidImageUrlCandidate(largeCandidate)
    ) {
      continue;
    }
    entries.push({
      thumb: normalizeQuestionImageUrl(String(thumbCandidate)),
      large: normalizeQuestionImageUrl(String(largeCandidate)),
    });
  }

  return entries;
}

export function extractQuestionImageEntries(
  source: Record<string, unknown> | undefined | null
): QuestionImageEntry[] {
  if (!source) return [];
  return parseQuestionImageList(source.img);
}

export function isStandardQuestion(question: QuizQuestion): question is StandardQuestion {
  return "type" in question;
}

export function isOceanQuestion(question: QuizQuestion): question is CustomOceanQuestion {
  return "questionKey" in question && !("type" in question);
}

export function resolveQuestionImageEntries(
  question: QuizQuestion | undefined,
  normalizedQuestion: NormalizedQuestion | null
): QuestionImageEntry[] {
  if (!question) return [];

  if (isOceanQuestion(question)) {
    const directEntries = extractQuestionImageEntries(question.extra);
    if (directEntries.length > 0) {
      return directEntries;
    }
  }

  if (normalizedQuestion?.raw && typeof normalizedQuestion.raw === "object") {
    return extractQuestionImageEntries(normalizedQuestion.raw as Record<string, unknown>);
  }

  return [];
}

export function findNormalizedQuestion(
  question: QuizQuestion | undefined,
  normalizedQuestions: NormalizedQuestion[]
): NormalizedQuestion | null {
  if (!question) return null;
  const targetId = isStandardQuestion(question)
    ? question.id
    : isOceanQuestion(question)
      ? question.questionKey
      : null;
  if (!targetId) return null;
  return normalizedQuestions.find((item) => item.id === targetId) ?? null;
}

export function isImageTypeQuestion(normalizedQuestion: NormalizedQuestion | null): boolean {
  if (!normalizedQuestion) return false;
  const typeTokens: string[] = [];
  if (typeof normalizedQuestion.type === "string" && normalizedQuestion.type.trim()) {
    typeTokens.push(normalizedQuestion.type.trim());
  }
  if (normalizedQuestion.raw && typeof normalizedQuestion.raw === "object") {
    const rawType = (normalizedQuestion.raw as Record<string, unknown>).type;
    if (typeof rawType === "string" && rawType.trim()) {
      typeTokens.push(rawType.trim());
    }
  }
  return typeTokens.some((token) => token.includes("图片题"));
}

export function resolveQuestionId(question: QuizQuestion): string {
  return "id" in question ? question.id : question.questionKey;
}

export function resolveOptionLetter(question: StandardQuestion, value: string): string {
  const index = question.options.findIndex((option) => option.value === value);
  if (index >= 0) {
    return String.fromCharCode(65 + index);
  }
  return value.toUpperCase();
}

interface WordbankToken {
  kind: "text" | "blank";
  content: string;
  blankId?: string;
}

export function parseWordbankTemplate(template: string): {
  tokens: WordbankToken[];
  blankIds: string[];
} {
  const tokens: WordbankToken[] = [];
  const blankIds: string[] = [];
  if (!template) {
    return { tokens: [{ kind: "text", content: "" }], blankIds };
  }

  const pattern = /{{(.*?)}}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(template)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        kind: "text",
        content: template.slice(lastIndex, match.index),
      });
    }

    const rawId = (match[1] ?? "").trim();
    const blankId = rawId || `blank${blankIds.length + 1}`;
    tokens.push({
      kind: "blank",
      content: "",
      blankId,
    });
    blankIds.push(blankId);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < template.length) {
    tokens.push({
      kind: "text",
      content: template.slice(lastIndex),
    });
  }

  if (tokens.length === 0) {
    tokens.push({ kind: "text", content: template });
  }

  return { tokens, blankIds };
}

export function asStringArray(value: string | string[] | null | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value) return [value];
  return [];
}

export function arraysShallowEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

export function canonicalizeWordbankValue(
  raw: unknown,
  options: StandardQuestionOption[]
): string {
  const token = raw === undefined || raw === null ? "" : String(raw).trim();
  if (!token) return "";

  const direct = options.find((option) => option.value === token);
  if (direct) return direct.value;

  const labelMatch = options.find((option) => option.label === token);
  if (labelMatch) return labelMatch.value;

  if (/^[a-z]$/i.test(token)) {
    const upper = token.toUpperCase();
    const upperMatch = options.find((option) => option.value === upper);
    return upperMatch ? upperMatch.value : upper;
  }

  return token;
}

export function parseWordbankSelectionInput(
  raw: string | string[] | null | undefined
): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => (item == null ? "" : String(item).trim()))
      .filter(Boolean);
  }

  if (typeof raw !== "string") {
    return [];
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  if (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => (item == null ? "" : String(item).trim()))
          .filter(Boolean);
      }
      if (parsed && typeof parsed === "object") {
        return Object.values(parsed as Record<string, unknown>)
          .map((item) => (item == null ? "" : String(item).trim()))
          .filter(Boolean);
      }
    } catch {
      /* noop */
    }
  }

  const separatorSegments = trimmed
    .split(/[,，;；\/\\|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (separatorSegments.length > 1) {
    return separatorSegments;
  }

  if (trimmed.includes(" ")) {
    const whitespaceSegments = trimmed
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (whitespaceSegments.length > 1) {
      return whitespaceSegments;
    }
  }

  if (/^[A-Za-z]+$/.test(trimmed)) {
    return trimmed.split("");
  }

  return [trimmed];
}

export function canonicalizeWordbankSelections(
  raw: string | string[] | null | undefined,
  blanks: number,
  options: StandardQuestionOption[]
): string[] {
  const parsed = parseWordbankSelectionInput(raw);
  const length = blanks > 0 ? blanks : parsed.length;
  if (length === 0) {
    return parsed.map((value) => canonicalizeWordbankValue(value, options));
  }
  return Array.from({ length }, (_, index) =>
    canonicalizeWordbankValue(parsed[index], options)
  );
}

export function matchingPairsToMap(pairs: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of pairs) {
    const [left, right] = pair.split(":");
    if (left && right) {
      map.set(left.trim(), right.trim());
    }
  }
  return map;
}

export function mapToMatchingPairs(map: Map<string, string>): string[] {
  return Array.from(map.entries()).map(([left, right]) => `${left}:${right}`);
}

export function normalizeMatchingPairs(
  selection: string | string[] | null | undefined
): string[] {
  if (!selection) return [];
  if (Array.isArray(selection)) {
    return selection
      .map((item) => String(item))
      .map((item) => (item.includes(":") ? item : ""))
      .filter(Boolean);
  }
  if (typeof selection === "string" && selection.includes(":")) {
    return [selection];
  }
  return [];
}

export function matchingPairsToSheetAnswer(pairs: string[]): string {
  const obj = Object.fromEntries(pairs.map((pair) => pair.split(":")));
  return Object.keys(obj).length > 0 ? JSON.stringify(obj) : "未选";
}

export function formatAnswerForQuestionSheet(
  question: StandardQuestion,
  selection: string | string[] | null | undefined
): string {
  if (question.type === "fill") {
    return "填空";
  }

  if (question.type === "wordbank" || question.type === "point-select") {
    const selections = parseWordbankSelectionInput(selection);
    if (selections.length === 0) {
      return "未选";
    }
    const canonicalValues = selections.map((item) =>
      canonicalizeWordbankValue(item, question.options)
    );
    const hasValue = canonicalValues.some((item) => item);
    if (!hasValue) {
      return "未选";
    }
    if (canonicalValues.every((item) => item.length === 1)) {
      return canonicalValues.join("");
    }
    const letterTokens = canonicalValues
      .map((value) => resolveOptionLetter(question, value))
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
    if (letterTokens.length > 0 && letterTokens.every((token) => token.length === 1)) {
      return letterTokens.join("");
    }
    const labelMap = new Map(
      question.options.map((option) => [option.value, option.label])
    );
    const labels = canonicalValues
      .map((item) => (item ? labelMap.get(item) ?? item : ""))
      .filter(Boolean);
    return labels.length > 0 ? labels.join("/") : "未选";
  }

  if (Array.isArray(selection)) {
    if (selection.length === 0) return "未选";
    const letters = selection
      .map((item) => resolveOptionLetter(question, String(item)))
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean)
      .sort();
    return letters.join("") || "未选";
  }

  if (question.type === "matching") {
    const pairs = normalizeMatchingPairs(selection);
    if (!pairs.length) return "未选";
    return matchingPairsToSheetAnswer(pairs);
  }

  if (!selection) {
    return "未选";
  }

  const letter = resolveOptionLetter(question, String(selection));
  const normalized = letter.trim().toUpperCase();
  return normalized || "未选";
}

export function formatStandardQuestionAnswer(question: StandardQuestion): string | null {
  const raw = question.correctAnswer;
  if (raw === undefined || raw === null) {
    return null;
  }

  if (question.type === "wordbank" || question.type === "point-select") {
    const values = parseWordbankSelectionInput(
      raw as string | string[] | null | undefined
    );
    if (values.length === 0) {
      return null;
    }
    const canonicalValues = values.map((value) =>
      canonicalizeWordbankValue(value, question.options)
    );
    const hasValue = canonicalValues.some((item) => item);
    if (!hasValue) {
      return null;
    }
    if (canonicalValues.every((item) => item.length === 1)) {
      return canonicalValues.join("");
    }
    const labelMap = new Map(
      question.options.map((option) => [option.value, option.label])
    );
    const labels = canonicalValues
      .map((value) => (value ? labelMap.get(value) ?? value : ""))
      .filter((value) => value && value.trim().length > 0);
    return labels.length ? labels.join(" / ") : null;
  }

  const values = (Array.isArray(raw) ? raw : [raw])
    .map((value) => (value == null ? "" : String(value).trim()))
    .filter(Boolean);

  if (values.length === 0) {
    return null;
  }

  if (question.type === "matching") {
    const leftItems = question.matching?.left ?? [];
    const rightItems = question.matching?.right ?? [];
    const segments = values
      .map((pair) => {
        if (!pair.includes(":")) {
          return pair;
        }
        const [leftRaw, rightRaw] = pair.split(":");
        const leftId = leftRaw?.trim();
        const rightId = rightRaw?.trim();
        if (!leftId || !rightId) {
          return pair;
        }
        const leftIndex = leftItems.findIndex((item) => item.id === leftId);
        const rightIndex = rightItems.findIndex((item) => item.id === rightId);
        const leftLabel = leftIndex >= 0 ? String(leftIndex + 1) : leftId;
        const rightLetter =
          rightIndex >= 0 ? String.fromCharCode(65 + rightIndex) : rightId.toUpperCase();
        return `${leftLabel}-${rightLetter}`;
      })
      .filter(Boolean);
    return segments.length ? segments.join("|") : null;
  }

  if (question.type === "fill") {
    return values.join("") || null;
  }

  if (question.type === "multiple" || question.type === "indeterminate") {
    const tokens = values
      .map((value) => resolveOptionLetter(question, value).trim().toUpperCase())
      .filter(Boolean)
      .sort();
    return tokens.length ? tokens.join("") : null;
  }

  if (question.type === "single" || question.type === "boolean") {
    const token = resolveOptionLetter(question, values[0]).trim().toUpperCase();
    return token || values[0];
  }

  return values.join(" / ") || null;
}

export function formatOceanQuestionAnswer(question: CustomOceanQuestion): string | null {
  const rawAnswers = (question.correctAnswerIds ?? []).map((value) => String(value).trim());
  if (rawAnswers.length > 0) {
    const ordered = sortOceanSelectionIds(rawAnswers, question.optionPool);
    const letters = ordered
      .map((value) => {
        const index = question.optionPool.findIndex((option) => option.id === value);
        if (index >= 0) {
          return String.fromCharCode(65 + index);
        }
        return value.toUpperCase();
      })
      .filter(Boolean);
    return letters.length ? letters.join("") : null;
  }

  const bucketAnswers = (question.correctBuckets ?? []).map((value) => String(value).trim());
  if (bucketAnswers.length > 0) {
    return bucketAnswers.filter(Boolean).join(" / ") || null;
  }

  return null;
}

export function resolveStandardTypeLabel(type: StandardQuestion["type"]): string {
  switch (type) {
    case "single":
      return "单选题";
    case "multiple":
      return "多选题";
    case "indeterminate":
      return "不定项选择题";
    case "boolean":
      return "判断题";
    case "wordbank":
      return "选词填空";
    case "point-select":
      return "点选题";
    case "matching":
      return "连线题";
    case "fill":
      return "填空题";
    default:
      return "题目";
  }
}

export function resolveOceanTypeLabel(question: CustomOceanQuestion): string {
  const raw = question.extra as Record<string, unknown> | undefined;
  const rawType =
    raw && typeof raw.type === "string" ? raw.type.trim() : undefined;
  if (rawType) return rawType;
  if (question.categories.length > 0 && question.categories[0]) {
    return String(question.categories[0]);
  }
  return "题目";
}

export function resolveOceanSelectionMode(
  question: CustomOceanQuestion
): "single" | "multiple" {
  const answers = question.correctAnswerIds ?? [];
  if (answers.length > 1) return "multiple";

  const raw = question.extra as Record<string, unknown> | undefined;
  const rawType =
    raw && typeof raw.type === "string"
      ? raw.type.trim().toLowerCase()
      : undefined;

  if (rawType) {
    if (
      rawType.includes("多选") ||
      rawType.includes("多项") ||
      rawType.includes("multiple")
    ) {
      return "multiple";
    }
    if (
      rawType.includes("单选") ||
      rawType.includes("判断") ||
      rawType.includes("是非") ||
      rawType.includes("single") ||
      rawType.includes("boolean")
    ) {
      return "single";
    }
  }

  if (question.categories.some((item) => /多/.test(item))) {
    return "multiple";
  }

  return "single";
}

export function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function sortOceanSelectionIds(
  rawValues: (string | number)[],
  optionPool: CustomOceanQuestion["optionPool"]
): string[] {
  const normalized = dedupeStrings(rawValues.map((value) => String(value)));
  if (normalized.length === 0) return [];

  const ordered: string[] = [];
  for (const option of optionPool) {
    if (normalized.includes(option.id)) {
      ordered.push(option.id);
    }
  }

  if (ordered.length === normalized.length) {
    return ordered;
  }

  const remaining = normalized.filter((value) => !ordered.includes(value));
  return [...ordered, ...remaining];
}
