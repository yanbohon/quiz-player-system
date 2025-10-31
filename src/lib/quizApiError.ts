import { Toast } from "@/lib/arco";
import {
  QuizApiError,
  QuizApiErrorType,
} from "@/lib/fusionClient";

const TYPE_LABEL: Record<QuizApiErrorType, string> = {
  network: "网络错误",
  business: "业务错误",
  timeout: "超时错误",
};

export function ensureQuizApiError(error: unknown): QuizApiError {
  if (error instanceof QuizApiError) {
    return error;
  }
  if (error instanceof TypeError) {
    return new QuizApiError(
      "network",
      "网络异常，未能连接到服务器",
      "请检查网络连接后重试",
      error
    );
  }
  if (error instanceof Error) {
    return new QuizApiError(
      "business",
      error.message || "未知错误",
      "请联系工作人员或稍后重试",
      error
    );
  }
  return new QuizApiError(
    "business",
    "发生未知错误",
    "请联系工作人员或稍后重试",
    error
  );
}

export function showQuizApiErrorToast(error: unknown, context: string) {
  const quizError = ensureQuizApiError(error);
  const typeLabel = TYPE_LABEL[quizError.type] ?? "业务错误";
  const actionLabel = context ? `${context}` : "操作";
  const suggestion = quizError.suggestion ? `。建议：${quizError.suggestion}` : "";
  Toast.error(`【${typeLabel}】${actionLabel}失败：${quizError.message}${suggestion}`);
}
