import { describe, expect, it } from "vitest";
import type { NormalizedQuestion } from "@/lib/normalizeQuestion";
import type { CustomOceanQuestion, StandardQuestion } from "@/features/quiz/types";
import {
  isImageTypeQuestion,
  normalizeQuestionImageUrl,
  parseQuestionImageList,
  resolveQuestionImageEntries,
} from "./questionImages";

function createStandardQuestion(
  overrides: Partial<StandardQuestion> = {}
): StandardQuestion {
  return {
    id: "standard-1",
    title: "标准题",
    type: "single",
    options: [{ value: "A", label: "选项 A" }],
    ...overrides,
  };
}

function createOceanQuestion(
  overrides: Partial<CustomOceanQuestion> = {}
): CustomOceanQuestion {
  return {
    questionKey: "ocean-1",
    stem: "题海题",
    categories: [],
    correctBuckets: [],
    optionPool: [],
    ...overrides,
  };
}

function createNormalizedQuestion(
  overrides: Partial<NormalizedQuestion> = {}
): NormalizedQuestion {
  return {
    id: "normalized-1",
    type: "单选题",
    content: "题干",
    options: [],
    answer: [],
    source: "default",
    ...overrides,
  };
}

describe("questionImages", () => {
  it("normalizes absolute, protocol-relative, relative, and data image urls", () => {
    expect(normalizeQuestionImageUrl("http://example.com/a.png")).toBe(
      "https://example.com/a.png"
    );
    expect(normalizeQuestionImageUrl("//example.com/a.png")).toBe(
      "https://example.com/a.png"
    );
    expect(normalizeQuestionImageUrl("/quiz/a.png")).toBe(
      "https://cdn.ohvfx.com/quiz/a.png"
    );
    expect(normalizeQuestionImageUrl("data:image/png;base64,abc")).toBe(
      "data:image/png;base64,abc"
    );
  });

  it("parses image list from json string, filters invalid entries, and normalizes urls", () => {
    const entries = parseQuestionImageList(
      JSON.stringify([
        {
          thumb: "/thumb.png",
          large: "http://example.com/large.png",
        },
        {
          thumb: "/broken.txt",
          large: "/large.png",
        },
        {
          thumb: "data:image/png;base64,thumb",
          large: "//example.com/large.webp",
        },
      ])
    );

    expect(entries).toEqual([
      {
        thumb: "https://cdn.ohvfx.com/thumb.png",
        large: "https://example.com/large.png",
      },
      {
        thumb: "data:image/png;base64,thumb",
        large: "https://example.com/large.webp",
      },
    ]);
  });

  it("returns empty list for invalid or empty image payloads", () => {
    expect(parseQuestionImageList("")).toEqual([]);
    expect(parseQuestionImageList("not-json")).toEqual([]);
    expect(parseQuestionImageList({ thumb: "/a.png" })).toEqual([]);
    expect(parseQuestionImageList([{ thumb: "/a.png" }])).toEqual([]);
  });

  it("prefers ocean question extra images over normalized fallback", () => {
    const question = createOceanQuestion({
      extra: {
        img: JSON.stringify([
          {
            thumb: "/ocean-thumb.png",
            large: "/ocean-large.png",
          },
        ]),
      },
    });
    const normalizedQuestion = createNormalizedQuestion({
      id: "ocean-1",
      raw: {
        img: JSON.stringify([
          {
            thumb: "/fallback-thumb.png",
            large: "/fallback-large.png",
          },
        ]),
      },
    });

    expect(resolveQuestionImageEntries(question, normalizedQuestion)).toEqual([
      {
        thumb: "https://cdn.ohvfx.com/ocean-thumb.png",
        large: "https://cdn.ohvfx.com/ocean-large.png",
      },
    ]);
  });

  it("falls back to normalized question raw images for standard questions", () => {
    const question = createStandardQuestion({
      id: "standard-1",
    });
    const normalizedQuestion = createNormalizedQuestion({
      id: "standard-1",
      raw: {
        img: JSON.stringify([
          {
            thumb: "/standard-thumb.png",
            large: "/standard-large.png",
          },
        ]),
      },
    });

    expect(resolveQuestionImageEntries(question, normalizedQuestion)).toEqual([
      {
        thumb: "https://cdn.ohvfx.com/standard-thumb.png",
        large: "https://cdn.ohvfx.com/standard-large.png",
      },
    ]);
  });

  it("detects image questions from normalized type or raw type", () => {
    expect(
      isImageTypeQuestion(
        createNormalizedQuestion({
          type: "图片题",
        })
      )
    ).toBe(true);

    expect(
      isImageTypeQuestion(
        createNormalizedQuestion({
          type: "单选题",
          raw: {
            type: "扩展图片题",
          },
        })
      )
    ).toBe(true);

    expect(
      isImageTypeQuestion(
        createNormalizedQuestion({
          type: "单选题",
          raw: {
            type: "普通题",
          },
        })
      )
    ).toBe(false);
  });
});
