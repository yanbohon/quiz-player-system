// 通用类型定义

export interface Question {
  id: string;
  type: "single" | "multiple" | "true-false" | "text";
  title: string;
  content: string;
  options?: QuestionOption[];
  score: number;
  timeLimit?: number; // 秒
}

export interface QuestionOption {
  id: string;
  label: string;
  value: string;
}

export interface Answer {
  questionId: string;
  answer: string | string[];
  timestamp: number;
}

export interface User {
  id: string;
  name: string;
  team?: string;
  avatar?: string;
}

export interface Contest {
  id: string;
  name: string;
  description: string;
  startTime: string;
  endTime: string;
  status: "pending" | "active" | "finished";
}

export interface Submission {
  id: string;
  userId: string;
  questionId: string;
  answer: string | string[];
  score?: number;
  submittedAt: string;
}

