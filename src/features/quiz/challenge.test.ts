import { describe, expect, it } from "vitest";
import type { NormalizedQuestion } from "@/lib/normalizeQuestion";
import {
  buildChallengeCommand,
  buildChallengeSelectionOptions,
  buildChallengeTeamOptions,
  collectUsedChallengeTargets,
  parseChallengeCommand,
  resolveChallengeDisplayName,
  resolveChallengeOwner,
  resolveChallengeScoreBeneficiary,
  resolveChallengeScoreField,
  resolveChallengeTarget,
  validateQaChallengeQuestions,
} from "./challenge";

function createQuestion(
  id: string,
  raw: Record<string, unknown> = {}
): NormalizedQuestion {
  return {
    id,
    type: "multiple",
    content: `question-${id}`,
    options: [],
    answer: [],
    raw,
    source: "default",
  };
}

describe("challenge helpers", () => {
  it("resolves owner and target fields from question raw data", () => {
    const question = createQuestion("q1", {
      owner: "1001",
      challengeTarget: "1002",
    });

    expect(resolveChallengeOwner(question)).toBe("1001");
    expect(resolveChallengeTarget(question)).toBe("1002");
  });

  it("collects used challenge targets and validates challenge questions", () => {
    const questions = Array.from({ length: 9 }, (_, index) =>
      createQuestion(`q${index + 1}`, {
        owner: `10${index + 1}`,
        challengeTarget: index < 2 ? `20${index + 1}` : undefined,
      })
    );

    expect(Array.from(collectUsedChallengeTargets(questions))).toEqual([
      "201",
      "202",
    ]);
    expect(validateQaChallengeQuestions(questions)).toBeUndefined();
  });

  it("rejects invalid challenge question sets", () => {
    expect(
      validateQaChallengeQuestions([
        createQuestion("q1", { owner: "1001" }),
        createQuestion("q2", { owner: "1001" }),
      ])
    ).toBe("挑战题配置需要正好 9 道已配置 owner 的题目");

    const duplicateOwners = Array.from({ length: 9 }, (_, index) =>
      createQuestion(`q${index + 1}`, {
        owner: index === 0 || index === 8 ? "1001" : `10${index + 1}`,
      })
    );
    expect(validateQaChallengeQuestions(duplicateOwners)).toBe("挑战题 owner 重复：1001");
  });

  it("allows an owner to select itself while still rejecting duplicate targets", () => {
    const selfTargetQuestions = Array.from({ length: 9 }, (_, index) =>
      createQuestion(`q${index + 1}`, {
        owner: `10${index + 1}`,
        challengeTarget: index === 0 ? "101" : undefined,
      })
    );

    expect(validateQaChallengeQuestions(selfTargetQuestions)).toBeUndefined();

    const duplicateTargets = Array.from({ length: 9 }, (_, index) =>
      createQuestion(`q${index + 1}`, {
        owner: `10${index + 1}`,
        challengeTarget: index < 2 ? "101" : undefined,
      })
    );

    expect(validateQaChallengeQuestions(duplicateTargets)).toBe("challengeTarget 重复：101");
  });

  it("resolves the challenge score beneficiary with the confirmed scoring rules", () => {
    expect(
      resolveChallengeScoreBeneficiary({
        ownerId: "1001",
        targetId: "1001",
        isCorrect: true,
      })
    ).toBe("1001");

    expect(
      resolveChallengeScoreBeneficiary({
        ownerId: "1001",
        targetId: "1001",
        isCorrect: false,
      })
    ).toBeUndefined();

    expect(
      resolveChallengeScoreBeneficiary({
        ownerId: "1001",
        targetId: "1002",
        isCorrect: true,
      })
    ).toBe("1002");

    expect(
      resolveChallengeScoreBeneficiary({
        ownerId: "1001",
        targetId: "1002",
        isCorrect: false,
      })
    ).toBe("1001");
  });

  it("builds and parses challenge commands", () => {
    const command = buildChallengeCommand("1001", "1002");
    expect(command).toBe("challenge:1001:1002");
    expect(parseChallengeCommand(command)).toEqual({
      owner: "1001",
      challengeTarget: "1002",
    });
    expect(parseChallengeCommand("1002-challenge")).toBeNull();
  });

  it("builds team options from the general sheet directory", () => {
    const options = buildChallengeTeamOptions({
      "1001": {
        recordId: "rec-1",
        displayName: "ignored",
        fields: {
          用户ID: "1001",
          名称: "1.上海理工大学测试",
        },
      },
      alias: {
        recordId: "rec-1",
        displayName: "ignored",
        fields: {
          用户ID: "1001",
          名称: "1.上海理工大学测试",
        },
      },
      "1002": {
        recordId: "rec-2",
        displayName: "ignored",
        fields: {
          用户ID: "1002",
          名称: "2.上海政法学院",
        },
      },
    });

    expect(options).toEqual([
      { value: "1001", label: "1.上海理工大学测试" },
      { value: "1002", label: "2.上海政法学院" },
    ]);
    expect(
      resolveChallengeDisplayName("1002", {
        "1002": {
          recordId: "rec-2",
          displayName: "ignored",
          fields: {
            用户ID: "1002",
            名称: "2.上海政法学院",
          },
        },
      })
    ).toBe("2.上海政法学院");
  });

  it("builds selectable challenge options that allow the owner to answer for itself", () => {
    const selectionOptions = buildChallengeSelectionOptions({
      challengeOwnerId: "1001",
      teamProfiles: {
        "1001": {
          recordId: "rec-1",
          displayName: "ignored",
          fields: {
            用户ID: "1001",
            名称: "1.上海理工大学测试",
          },
        },
        "1002": {
          recordId: "rec-2",
          displayName: "ignored",
          fields: {
            用户ID: "1002",
            名称: "2.上海政法学院",
          },
        },
        "1003": {
          recordId: "rec-3",
          displayName: "ignored",
          fields: {
            用户ID: "1003",
            名称: "3.上海工程技术大学",
          },
        },
      },
      usedChallengeTargets: new Set(["1002"]),
    });

    expect(selectionOptions).toEqual([
      {
        value: "1001",
        label: "1.上海理工大学测试",
        status: "self",
        disabled: false,
        metaLabel: "本队可答",
      },
      {
        value: "1002",
        label: "2.上海政法学院",
        status: "used",
        disabled: true,
        metaLabel: "已被挑战",
      },
      {
        value: "1003",
        label: "3.上海工程技术大学",
        status: "available",
        disabled: false,
        metaLabel: "可挑战",
      },
    ]);
  });

  it("resolves challenge score field from stage raw fields", () => {
    expect(resolveChallengeScoreField({ challengeScoreField: "bonus" })).toBe("bonus");
    expect(resolveChallengeScoreField(undefined)).toBe("challengeScore");
  });
});
