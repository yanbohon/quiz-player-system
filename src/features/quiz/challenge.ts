import type { NormalizedQuestion } from "@/lib/normalizeQuestion";

const OWNER_FIELD = "owner";
const TARGET_FIELD = "challengeTarget";
const DEFAULT_CHALLENGE_SCORE_FIELD = "challengeScore";
const CHALLENGE_SCORE_FIELD_KEYS = [
  "challengeScoreField",
  "ChallengeScoreField",
  "challenge_score_field",
  "挑战分数字段",
  "挑战积分字段",
];
const USER_ID_FIELD_KEYS = [
  "用户ID",
  "用户 ID",
  "userId",
  "user_id",
  "ID",
  "id",
];
const DISPLAY_NAME_FIELD_KEYS = ["名称", "name", "队伍名称", "参赛队伍", "学校名"];

type TeamProfileLike = {
  recordId?: string;
  displayName?: string;
  fields?: Record<string, unknown>;
};

export type ChallengeSelectionOptionStatus = "available" | "self" | "used";

export type ChallengeSelectionOption = {
  value: string;
  label: string;
  status: ChallengeSelectionOptionStatus;
  disabled: boolean;
  metaLabel: string;
};

function normalizeText(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function readQuestionField(
  question: NormalizedQuestion | undefined,
  fieldKey: string
): string | undefined {
  if (!question?.raw || typeof question.raw !== "object") {
    return undefined;
  }
  return normalizeText((question.raw as Record<string, unknown>)[fieldKey]);
}

function readFirstField(
  fields: Record<string, unknown> | undefined,
  keys: string[]
): string | undefined {
  if (!fields) return undefined;
  for (const key of keys) {
    const value = normalizeText(fields[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function resolveChallengeOwner(question: NormalizedQuestion | undefined) {
  return readQuestionField(question, OWNER_FIELD);
}

export function resolveChallengeTarget(question: NormalizedQuestion | undefined) {
  return readQuestionField(question, TARGET_FIELD);
}

export function resolveChallengeScoreBeneficiary(params: {
  ownerId?: string | null;
  targetId?: string | null;
  isCorrect: boolean;
}) {
  const ownerId = normalizeText(params.ownerId);
  const targetId = normalizeText(params.targetId);

  if (!ownerId || !targetId) {
    return undefined;
  }

  if (ownerId === targetId) {
    return params.isCorrect ? ownerId : undefined;
  }

  return params.isCorrect ? targetId : ownerId;
}

export function collectUsedChallengeTargets(questions: NormalizedQuestion[]) {
  const result = new Set<string>();
  for (const question of questions) {
    const target = resolveChallengeTarget(question);
    if (target) {
      result.add(target);
    }
  }
  return result;
}

export function validateQaChallengeQuestions(questions: NormalizedQuestion[]) {
  const challengeQuestions = questions.filter((question) => Boolean(resolveChallengeOwner(question)));
  if (challengeQuestions.length !== 9) {
    return "挑战题配置需要正好 9 道已配置 owner 的题目";
  }

  const owners = new Set<string>();
  const targets = new Set<string>();
  for (const question of challengeQuestions) {
    const owner = resolveChallengeOwner(question);
    if (!owner) {
      continue;
    }
    if (owners.has(owner)) {
      return `挑战题 owner 重复：${owner}`;
    }
    owners.add(owner);

    const target = resolveChallengeTarget(question);
    if (!target) {
      continue;
    }
    if (targets.has(target)) {
      return `challengeTarget 重复：${target}`;
    }
    targets.add(target);
  }

  return undefined;
}

export function parseChallengeCommand(command: string) {
  const match = /^challenge:([^:]+):([^:]+)$/i.exec(command.trim());
  if (!match) return null;
  const owner = match[1]?.trim();
  const challengeTarget = match[2]?.trim();
  if (!owner || !challengeTarget) return null;
  return {
    owner,
    challengeTarget,
  };
}

export function buildChallengeCommand(owner: string, challengeTarget: string) {
  return `challenge:${owner}:${challengeTarget}`;
}

export function resolveChallengeScoreField(rawFields: Record<string, unknown> | undefined) {
  if (!rawFields) {
    return DEFAULT_CHALLENGE_SCORE_FIELD;
  }
  for (const key of CHALLENGE_SCORE_FIELD_KEYS) {
    const value = normalizeText(rawFields[key]);
    if (value) {
      return value;
    }
  }
  return DEFAULT_CHALLENGE_SCORE_FIELD;
}

export function buildChallengeTeamOptions(teamProfiles: Record<string, TeamProfileLike>) {
  const options = new Map<string, { value: string; label: string }>();

  for (const profile of Object.values(teamProfiles)) {
    const userId =
      readFirstField(profile.fields, USER_ID_FIELD_KEYS) ??
      normalizeText(profile.recordId);
    const label =
      readFirstField(profile.fields, DISPLAY_NAME_FIELD_KEYS) ??
      normalizeText(profile.displayName) ??
      userId;

    if (!userId || !label || options.has(userId)) {
      continue;
    }

    options.set(userId, { value: userId, label });
  }

  return Array.from(options.values());
}

export function buildChallengeSelectionOptions(params: {
  challengeOwnerId?: string | null;
  teamProfiles: Record<string, TeamProfileLike>;
  usedChallengeTargets: ReadonlySet<string>;
}): ChallengeSelectionOption[] {
  const { challengeOwnerId, teamProfiles, usedChallengeTargets } = params;
  return buildChallengeTeamOptions(teamProfiles).map((option) => {
    const isSelf = Boolean(challengeOwnerId) && option.value === challengeOwnerId;
    const isUsed = usedChallengeTargets.has(option.value);

    return {
      ...option,
      status: isUsed ? "used" : isSelf ? "self" : "available",
      disabled: isUsed,
      metaLabel: isSelf ? (isUsed ? "本队，已被挑战" : "本队可答") : isUsed ? "已被挑战" : "可挑战",
    };
  });
}

export function resolveChallengeDisplayName(
  identifier: string | null | undefined,
  teamProfiles: Record<string, TeamProfileLike>
) {
  if (!identifier) return null;
  const option = buildChallengeTeamOptions(teamProfiles).find(
    (item) => item.value === identifier
  );
  return option?.label ?? identifier;
}
