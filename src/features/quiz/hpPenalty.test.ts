import { describe, expect, it } from "vitest";

import {
  applyHpPenalty,
  createHpPenaltyRecord,
  createPenaltyGuardKey,
  shouldClearRecoveredPenalty,
} from "./hpPenalty";

describe("hpPenalty", () => {
  it("reuses the same deduction for duplicate submissions in one activation", () => {
    const guardKey = createPenaltyGuardKey("q-1", 1);
    const latestPenalty = createHpPenaltyRecord({
      currentHp: 3,
      deduction: 1,
      questionId: "q-1",
      guardKey,
      source: "answer",
      timestamp: 100,
    });

    const result = applyHpPenalty({
      currentHp: 2,
      deduction: 1,
      latestPenalty: latestPenalty ?? undefined,
      questionId: "q-1",
      guardKey,
      source: "answer",
      enforceElimination: true,
      modeId: "last-stand",
      timestamp: 200,
    });

    expect(result.reused).toBe(true);
    expect(result.nextHp).toBe(2);
    expect(result.penaltyRecord).toEqual(latestPenalty);
  });

  it("deducts again when the same question appears in a new activation", () => {
    const previousPenalty = createHpPenaltyRecord({
      currentHp: 3,
      deduction: 1,
      questionId: "q-1",
      guardKey: createPenaltyGuardKey("q-1", 1),
      source: "answer",
      timestamp: 100,
    });

    const result = applyHpPenalty({
      currentHp: 2,
      deduction: 1,
      latestPenalty: previousPenalty ?? undefined,
      questionId: "q-1",
      guardKey: createPenaltyGuardKey("q-1", 2),
      source: "answer",
      enforceElimination: true,
      modeId: "last-stand",
      timestamp: 200,
    });

    expect(result.reused).toBe(false);
    expect(result.nextHp).toBe(1);
    expect(result.penaltyRecord).toMatchObject({
      hpBefore: 2,
      hpAfter: 1,
      amount: 1,
      questionId: "q-1",
      guardKey: createPenaltyGuardKey("q-1", 2),
      source: "answer",
    });
  });

  it("marks elimination only when hp reaches zero", () => {
    const result = applyHpPenalty({
      currentHp: 1,
      deduction: 1,
      latestPenalty: undefined,
      questionId: "q-2",
      guardKey: createPenaltyGuardKey("q-2", 3),
      source: "answer",
      enforceElimination: true,
      modeId: "ocean-adventure",
      timestamp: 300,
    });

    expect(result.nextHp).toBe(0);
    expect(result.shouldDisableAnswering).toBe(true);
    expect(result.oceanEndReason).toBe("hp");
  });

  it("clears the last penalty only when hp is actually restored upward", () => {
    const latestPenalty = createHpPenaltyRecord({
      currentHp: 3,
      deduction: 1,
      questionId: "q-3",
      guardKey: createPenaltyGuardKey("q-3", 4),
      source: "answer",
      timestamp: 400,
    });

    expect(
      shouldClearRecoveredPenalty({
        currentHp: 2,
        targetHp: 3,
        latestPenalty: latestPenalty ?? undefined,
      })
    ).toBe(true);

    expect(
      shouldClearRecoveredPenalty({
        currentHp: 2,
        targetHp: 2,
        latestPenalty: latestPenalty ?? undefined,
      })
    ).toBe(false);
  });
});
