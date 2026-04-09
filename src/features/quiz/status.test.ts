import { describe, expect, it } from "vitest";
import {
  resolveLastStandGroupStatusIndicator,
  resolveStatusFieldKey,
} from "./status";

describe("status", () => {
  describe("resolveStatusFieldKey", () => {
    it("returns the first known status field candidate found in priority order", () => {
      expect(
        resolveStatusFieldKey({
          Status: "1",
          status: "2",
          生命值: "3",
        })
      ).toBe("生命值");

      expect(
        resolveStatusFieldKey({
          status: "2",
          Status: "1",
        })
      ).toBe("status");
    });

    it("falls back to the default status field key when fields are missing or unknown", () => {
      expect(resolveStatusFieldKey()).toBe("状态");
      expect(resolveStatusFieldKey({ score: 100 })).toBe("状态");
    });
  });

  describe("resolveLastStandGroupStatusIndicator", () => {
    it("maps direct stage names with half-width or full-width parentheses", () => {
      expect(resolveLastStandGroupStatusIndicator("一站到底(初中组)")).toBe("3");
      expect(resolveLastStandGroupStatusIndicator("一站到底（中职组）")).toBe("2");
      expect(resolveLastStandGroupStatusIndicator("一站到底(高中组)")).toBe("1");
    });

    it("normalizes whitespace and group labels inside stage names", () => {
      expect(resolveLastStandGroupStatusIndicator("一站到底 ( 初中组 )")).toBe("3");
      expect(resolveLastStandGroupStatusIndicator("一站到底（中职）")).toBe("2");
      expect(resolveLastStandGroupStatusIndicator("一站到底( 高中 )")).toBe("1");
    });

    it("returns undefined for empty or unknown stage names", () => {
      expect(resolveLastStandGroupStatusIndicator()).toBeUndefined();
      expect(resolveLastStandGroupStatusIndicator("")).toBeUndefined();
      expect(resolveLastStandGroupStatusIndicator("争分夺秒")).toBeUndefined();
      expect(resolveLastStandGroupStatusIndicator("一站到底(大学组)")).toBeUndefined();
    });
  });
});
