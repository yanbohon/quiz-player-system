import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

// 查询键工厂
export const queryKeys = {
  questions: {
    all: ["questions"] as const,
    detail: (id: string) => ["questions", id] as const,
    list: (filters?: Record<string, unknown>) => 
      ["questions", "list", filters] as const,
  },
  user: {
    profile: ["user", "profile"] as const,
    answers: ["user", "answers"] as const,
  },
};

// 示例：获取题目列表
export function useQuestions(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.questions.list(filters),
    queryFn: () => api.get("/questions", { 
      // 这里可以添加查询参数
    }),
    enabled: !!filters, // 仅在有过滤条件时启用
  });
}

// 示例：获取题目详情
export function useQuestion(id: string) {
  return useQuery({
    queryKey: queryKeys.questions.detail(id),
    queryFn: () => api.get(`/questions/${id}`),
    enabled: !!id,
  });
}

// 示例：提交答案
export function useSubmitAnswer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { questionId: string; answer: string }) =>
      api.post("/answers", data),
    onSuccess: () => {
      // 提交成功后，使相关查询失效
      queryClient.invalidateQueries({ queryKey: queryKeys.user.answers });
    },
  });
}

// 示例：获取用户信息
export function useUserProfile() {
  return useQuery({
    queryKey: queryKeys.user.profile,
    queryFn: () => api.get("/user/profile"),
  });
}

