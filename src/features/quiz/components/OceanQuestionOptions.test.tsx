import type { Dispatch, SetStateAction } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import type { CustomOceanQuestion } from "@/features/quiz/types";
import optionStyles from "./OptionCardButton.module.css";
import { OceanQuestionOptions } from "./OceanQuestionOptions";

function createQuestion(overrides: Partial<CustomOceanQuestion> = {}): CustomOceanQuestion {
  return {
    questionKey: "ocean-1",
    stem: "题海题",
    categories: ["单选题"],
    correctBuckets: [],
    optionPool: [
      { id: "opt-2", label: "选项 2" },
      { id: "opt-1", label: "选项 1" },
      { id: "opt-3", label: "选项 3" },
    ],
    correctAnswerIds: ["opt-1"],
    extra: {
      type: "单选题",
    },
    ...overrides,
  };
}

function createSetter() {
  return vi.fn();
}

describe("OceanQuestionOptions", () => {
  it("toggles single-choice selections on and off", async () => {
    const setSelected = createSetter();
    const { user, rerender } = renderWithProviders(
      <OceanQuestionOptions
        question={createQuestion()}
        selected={null}
        setSelected={setSelected as unknown as Dispatch<SetStateAction<string | string[] | null>>}
        answeringEnabled
        isCommandSubmissionLocked={false}
        isAnswerRevealActive={false}
      />
    );

    await user.click(screen.getByRole("radio", { name: /选项 1/i }));
    const firstUpdater = setSelected.mock.calls[0]?.[0];
    expect(typeof firstUpdater).toBe("function");
    expect((firstUpdater as (prev: string | string[] | null) => string | null)(null)).toBe(
      "opt-1"
    );

    setSelected.mockClear();
    rerender(
      <OceanQuestionOptions
        question={createQuestion()}
        selected="opt-1"
        setSelected={setSelected as unknown as Dispatch<SetStateAction<string | string[] | null>>}
        answeringEnabled
        isCommandSubmissionLocked={false}
        isAnswerRevealActive={false}
      />
    );

    await user.click(screen.getByRole("radio", { name: /选项 1/i }));
    const secondUpdater = setSelected.mock.calls[0]?.[0];
    expect(typeof secondUpdater).toBe("function");
    expect(
      (secondUpdater as (prev: string | string[] | null) => string | null)("opt-1")
    ).toBeNull();
  });

  it("keeps multiple-choice selections ordered by optionPool", async () => {
    const setSelected = createSetter();
    const { user } = renderWithProviders(
      <OceanQuestionOptions
        question={createQuestion({
          correctAnswerIds: ["opt-1", "opt-3"],
          extra: {
            type: "多选题",
          },
        })}
        selected={["opt-3"]}
        setSelected={setSelected as unknown as Dispatch<SetStateAction<string | string[] | null>>}
        answeringEnabled
        isCommandSubmissionLocked={false}
        isAnswerRevealActive={false}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: /选项 1/i }));

    const updater = setSelected.mock.calls[0]?.[0];
    expect(typeof updater).toBe("function");
    expect(
      (updater as (prev: string | string[] | null) => string[])(["opt-3"])
    ).toEqual(["opt-1", "opt-3"]);
  });

  it("ignores clicks while command submission is locked", async () => {
    const setSelected = createSetter();
    const { user } = renderWithProviders(
      <OceanQuestionOptions
        question={createQuestion()}
        selected={null}
        setSelected={setSelected as unknown as Dispatch<SetStateAction<string | string[] | null>>}
        answeringEnabled
        isCommandSubmissionLocked
        isAnswerRevealActive={false}
      />
    );

    await user.click(screen.getByRole("radio", { name: /选项 1/i }));

    expect(setSelected).not.toHaveBeenCalled();
  });

  it("shows correct and wrong reveal states after answer reveal", () => {
    renderWithProviders(
      <OceanQuestionOptions
        question={createQuestion({
          correctAnswerIds: ["opt-1"],
        })}
        selected={["opt-2"]}
        setSelected={
          createSetter() as unknown as Dispatch<SetStateAction<string | string[] | null>>
        }
        answeringEnabled
        isCommandSubmissionLocked={false}
        isAnswerRevealActive
      />
    );

    const correctButton = screen.getByRole("radio", { name: /选项 1/i });
    const wrongButton = screen.getByRole("radio", { name: /选项 2/i });

    expect(correctButton.className).toContain(optionStyles.optionCardCorrect);
    expect(wrongButton.className).toContain(optionStyles.optionCardWrong);
  });
});
