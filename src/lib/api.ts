import { apiFetch } from "./api/client";
import {
  NormalizedQuestion,
  normalizeQuestion,
} from "./normalizeQuestion";

export type QuestionSource = "tihai" | "default";

export interface FetchNormalizedOptions extends RequestInit {
  source: QuestionSource;
}

export async function fetchNormalizedQuestions(
  endpoint: string,
  options: FetchNormalizedOptions
): Promise<NormalizedQuestion[]> {
  const { source, ...requestOptions } = options;
  const payload = await apiFetch<unknown>(endpoint, requestOptions);
  return normalizeQuestion(payload, source);
}

export async function fetchQuestionsFromSource(
  endpoint: string,
  source: QuestionSource,
  options?: RequestInit
): Promise<NormalizedQuestion[]> {
  return fetchNormalizedQuestions(endpoint, {
    source,
    ...options,
  });
}
