import { describe, expect, it } from "vitest";
import type { MatchingOption, StandardQuestionOption } from "@/features/quiz/types";
import {
  canonicalizeWordbankSelections,
  matchingPairsToSheetAnswer,
  orderMatchingPairs,
  parseWordbankSelectionInput,
} from "./answering";

const WORD_OPTIONS: StandardQuestionOption[] = [
  { value: "A", label: "apple" },
  { value: "B", label: "banana" },
  { value: "C", label: "citrus" },
];

const MATCHING_LEFT: MatchingOption[] = [
  { id: "1", label: "Mercury" },
  { id: "2", label: "Venus" },
  { id: "3", label: "Earth" },
];

describe("answering utilities", () => {
  describe("parseWordbankSelectionInput", () => {
    it("parses JSON array strings and trims empty items", () => {
      expect(parseWordbankSelectionInput('[" A ", "", "B", null]')).toEqual(["A", "B"]);
    });

    it("parses object-like strings by using values", () => {
      expect(parseWordbankSelectionInput('{"first":"A","second":" B "}')).toEqual(["A", "B"]);
    });

    it("splits by separators and whitespace", () => {
      expect(parseWordbankSelectionInput("A, B / C")).toEqual(["A", "B", "C"]);
      expect(parseWordbankSelectionInput("alpha beta gamma")).toEqual([
        "alpha",
        "beta",
        "gamma",
      ]);
    });

    it("splits contiguous letters into tokens", () => {
      expect(parseWordbankSelectionInput("ABC")).toEqual(["A", "B", "C"]);
    });
  });

  describe("canonicalizeWordbankSelections", () => {
    it("maps labels and lowercase option ids to canonical values", () => {
      expect(canonicalizeWordbankSelections("apple, b", 3, WORD_OPTIONS)).toEqual([
        "A",
        "B",
        "",
      ]);
    });

    it("uses parsed length when blanks is zero", () => {
      expect(canonicalizeWordbankSelections(["apple", "c"], 0, WORD_OPTIONS)).toEqual([
        "A",
        "C",
      ]);
    });
  });

  describe("matching helpers", () => {
    it("orders matching pairs according to the left-side definition", () => {
      const pairs = ["2:B", "3:C", "1:A"];
      expect(orderMatchingPairs(pairs, MATCHING_LEFT)).toEqual(["1:A", "2:B", "3:C"]);
    });

    it("drops unmatched entries when reordering by left-side definition", () => {
      const pairs = ["2:B", "9:Z"];
      expect(orderMatchingPairs(pairs, MATCHING_LEFT)).toEqual(["2:B"]);
    });

    it("serializes matching pairs into a question-sheet payload", () => {
      const payload = matchingPairsToSheetAnswer(["1:A", "2:B"]);
      expect(JSON.parse(payload)).toEqual({
        "1": "A",
        "2": "B",
      });
    });

    it("returns the unselected marker for empty matching pairs", () => {
      expect(matchingPairsToSheetAnswer([])).toBe("未选");
    });
  });
});
