import { describe, expect, it } from "vitest";

import {
  isUltimateBuzzerWinnerSelf,
  resolveUltimateBuzzerIdentity,
  resolveUltimateBuzzerWinnerLabel,
} from "./ultimateBuzzer";

describe("ultimateBuzzer", () => {
  it("uses the contestant id for classic ultimate challenge", () => {
    expect(
      resolveUltimateBuzzerIdentity({
        modeId: "ultimate-challenge",
        userId: "1001",
        sprintTeamId: "red",
      })
    ).toBe("1001");
  });

  it("uses the selected team id for buzzer sprint", () => {
    expect(
      resolveUltimateBuzzerIdentity({
        modeId: "buzzer-sprint",
        userId: "1001",
        sprintTeamId: "blue",
      })
    ).toBe("blue");
  });

  it("accepts either team ids or the current user id as a self winner in buzzer sprint", () => {
    expect(
      isUltimateBuzzerWinnerSelf({
        modeId: "buzzer-sprint",
        winnerId: "red",
        userId: "1001",
        sprintTeamId: "red",
      })
    ).toBe(true);

    expect(
      isUltimateBuzzerWinnerSelf({
        modeId: "buzzer-sprint",
        winnerId: "1001",
        userId: "1001",
        sprintTeamId: "red",
      })
    ).toBe(true);

    expect(
      isUltimateBuzzerWinnerSelf({
        modeId: "buzzer-sprint",
        winnerId: "blue",
        userId: "1001",
        sprintTeamId: "red",
      })
    ).toBe(false);
  });

  it("maps red and blue winners to team labels before falling back to profile names", () => {
    expect(resolveUltimateBuzzerWinnerLabel("red", "一号竞答队")).toBe("红队");
    expect(resolveUltimateBuzzerWinnerLabel("blue", "二号竞答队")).toBe("蓝队");
    expect(resolveUltimateBuzzerWinnerLabel("1002", "二号竞答队")).toBe("二号竞答队");
    expect(resolveUltimateBuzzerWinnerLabel("1002")).toBe("台号1002");
  });
});
