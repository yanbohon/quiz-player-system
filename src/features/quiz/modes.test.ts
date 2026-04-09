import { describe, expect, it } from "vitest";
import {
  CONTEST_MODES,
  DEFAULT_MODE,
  QA_VARIANT_MODE_IDS,
  isQaVariantMode,
  isUltimateBuzzMode,
} from "./modes";

describe("modes", () => {
  it("uses qa as the default mode", () => {
    expect(DEFAULT_MODE).toBe(CONTEST_MODES.qa);
    expect(DEFAULT_MODE.id).toBe("qa");
  });

  it("recognizes every qa variant and rejects non-qa modes", () => {
    expect(QA_VARIANT_MODE_IDS).toEqual(["qa", "qa-20", "qa-30", "qa-50"]);

    for (const id of QA_VARIANT_MODE_IDS) {
      expect(isQaVariantMode(id)).toBe(true);
      expect(CONTEST_MODES[id].channel).toBe("mqtt");
      expect(CONTEST_MODES[id].questionFlow).toBe("push");
      expect(CONTEST_MODES[id].questionFormat).toBe("standard");
      expect(CONTEST_MODES[id].features).toMatchObject({
        hasHp: false,
        requiresBuzzer: false,
        allowsDelegation: false,
        supportsTimer: false,
        autoAdvance: false,
        localQuestionCache: false,
      });
    }

    expect(isQaVariantMode("speed-run")).toBe(false);
    expect(isQaVariantMode("ultimate-challenge")).toBe(false);
  });

  it("defines the expected capability matrix for high-risk contest modes", () => {
    expect(CONTEST_MODES["last-stand-group"]).toMatchObject({
      channel: "mqtt",
      questionFlow: "push",
      answerFlow: "immediate",
      questionFormat: "standard",
      features: {
        hasHp: true,
        initialHp: 1,
        hpLossPerWrong: 1,
        requiresBuzzer: false,
      },
    });

    expect(CONTEST_MODES["speed-run"]).toMatchObject({
      channel: "api",
      questionFlow: "local",
      answerFlow: "immediate",
      questionFormat: "standard",
      features: {
        hasHp: false,
        supportsTimer: true,
        autoAdvance: true,
        localQuestionCache: true,
      },
    });

    expect(CONTEST_MODES["ocean-adventure"]).toMatchObject({
      channel: "api",
      questionFlow: "pull",
      answerFlow: "immediate",
      questionFormat: "custom",
      features: {
        hasHp: true,
        initialHp: 2,
        hpLossPerWrong: 1,
        supportsTimer: true,
        autoAdvance: true,
        localQuestionCache: false,
      },
    });

    expect(CONTEST_MODES["ultimate-challenge"]).toMatchObject({
      channel: "hybrid",
      questionFlow: "push",
      answerFlow: "external",
      questionFormat: "standard",
      features: {
        hasHp: false,
        requiresBuzzer: true,
        allowsDelegation: true,
        supportsTimer: true,
      },
    });

    expect(CONTEST_MODES["buzzer-sprint"]).toMatchObject({
      channel: "hybrid",
      questionFlow: "push",
      answerFlow: "external",
      questionFormat: "standard",
      features: {
        hasHp: false,
        requiresBuzzer: true,
        allowsDelegation: true,
        supportsTimer: true,
      },
    });

    expect(CONTEST_MODES["ultimate-pk"]).toMatchObject({
      channel: "mqtt",
      questionFlow: "push",
      answerFlow: "external",
      questionFormat: "standard",
      features: {
        hasHp: false,
        requiresBuzzer: false,
        allowsDelegation: false,
        supportsTimer: false,
      },
    });
  });

  it("groups the ultimate buzzer modes together", () => {
    expect(isUltimateBuzzMode("ultimate-challenge")).toBe(true);
    expect(isUltimateBuzzMode("buzzer-sprint")).toBe(true);
    expect(isUltimateBuzzMode("ultimate-pk")).toBe(false);
  });
});
