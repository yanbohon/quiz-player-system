import type { ContestModeId, HpPenaltyRecord } from "./types";

export function createPenaltyGuardKey(
  questionId?: string | null,
  activationId?: number | string | null
) {
  const normalizedQuestionId =
    typeof questionId === "string" ? questionId.trim() : "";
  const normalizedActivationId =
    activationId === undefined || activationId === null
      ? ""
      : String(activationId).trim();

  if (!normalizedQuestionId || !normalizedActivationId) {
    return undefined;
  }

  return `hp-penalty:${normalizedActivationId}:${normalizedQuestionId}`;
}

export function resolveReusablePenalty(params: {
  latestPenalty?: HpPenaltyRecord;
  guardKey?: string;
  currentHp: number;
}) {
  const { latestPenalty, guardKey, currentHp } = params;
  if (!latestPenalty || !guardKey) {
    return undefined;
  }
  if (latestPenalty.guardKey !== guardKey) {
    return undefined;
  }
  if (Math.trunc(latestPenalty.hpAfter) !== Math.trunc(currentHp)) {
    return undefined;
  }
  return latestPenalty;
}

export function createHpPenaltyRecord(params: {
  currentHp: number;
  deduction: number;
  questionId?: string;
  guardKey?: string;
  source: "answer" | "judgement";
  timestamp?: number;
}) {
  const baseHp = Math.max(0, Math.trunc(params.currentHp));
  const safeDeduction = Math.max(0, Math.trunc(params.deduction));
  const nextHp = Math.max(baseHp - safeDeduction, 0);
  const amount = Math.max(baseHp - nextHp, 0);

  if (amount <= 0) {
    return undefined;
  }

  return {
    amount,
    hpBefore: baseHp,
    hpAfter: nextHp,
    timestamp: params.timestamp ?? Date.now(),
    questionId: params.questionId,
    guardKey: params.guardKey,
    source: params.source,
  } satisfies HpPenaltyRecord;
}

export function applyHpPenalty(params: {
  currentHp: number;
  deduction: number;
  latestPenalty?: HpPenaltyRecord;
  questionId?: string;
  guardKey?: string;
  source: "answer" | "judgement";
  enforceElimination: boolean;
  modeId: ContestModeId;
  timestamp?: number;
}) {
  const reusablePenalty = resolveReusablePenalty({
    latestPenalty: params.latestPenalty,
    guardKey: params.guardKey,
    currentHp: params.currentHp,
  });
  if (reusablePenalty) {
    return {
      nextHp: reusablePenalty.hpAfter,
      penaltyRecord: reusablePenalty,
      reused: true,
      shouldDisableAnswering:
        params.enforceElimination && reusablePenalty.hpAfter <= 0,
      oceanEndReason:
        params.modeId === "ocean-adventure" && reusablePenalty.hpAfter <= 0
          ? ("hp" as const)
          : undefined,
    };
  }

  const penaltyRecord = createHpPenaltyRecord({
    currentHp: params.currentHp,
    deduction: params.deduction,
    questionId: params.questionId,
    guardKey: params.guardKey,
    source: params.source,
    timestamp: params.timestamp,
  });
  const nextHp = penaltyRecord?.hpAfter ?? Math.max(0, Math.trunc(params.currentHp));

  return {
    nextHp,
    penaltyRecord,
    reused: false,
    shouldDisableAnswering: params.enforceElimination && nextHp <= 0,
    oceanEndReason:
      params.modeId === "ocean-adventure" && nextHp <= 0
        ? ("hp" as const)
        : undefined,
  };
}

export function shouldClearRecoveredPenalty(params: {
  currentHp: number;
  targetHp: number;
  latestPenalty?: HpPenaltyRecord;
}) {
  const currentHp = Math.trunc(params.currentHp);
  const targetHp = Math.trunc(params.targetHp);
  const penaltyAfter = params.latestPenalty?.hpAfter;

  return (
    targetHp > currentHp &&
    typeof penaltyAfter === "number" &&
    Math.trunc(penaltyAfter) === currentHp
  );
}
