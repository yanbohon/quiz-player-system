import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { UltimatePkPanel, type UltimatePkPanelProps } from "./UltimatePkPanel";

vi.mock("@/features/quiz/components/QuizIcons", () => ({
  SwitchArrowsIcon: ({ className }: { className?: string }) =>
    createElement("span", {
      "data-testid": "switch-icon",
      className,
      "aria-hidden": "true",
    }),
}));

function createProps(
  overrides: Partial<UltimatePkPanelProps> = {}
): UltimatePkPanelProps {
  return {
    team: "affirmative",
    stageLocked: false,
    throttleActive: false,
    sending: false,
    onTeamSelect: vi.fn(),
    onSwitch: vi.fn(),
    ...overrides,
  };
}

describe("UltimatePkPanel", () => {
  it("renders team selector and allows switching teams and speaking side", async () => {
    const onTeamSelect = vi.fn();
    const onSwitch = vi.fn();
    const { user } = renderWithProviders(
      <UltimatePkPanel
        {...createProps({
          onTeamSelect,
          onSwitch,
        })}
      />
    );

    expect(screen.getByRole("radiogroup", { name: "请选择发言队伍" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "正方" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "反方" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("当前可切换发言队伍")).toBeInTheDocument();
    expect(screen.getByTestId("switch-icon")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "反方" }));
    await user.click(screen.getByRole("button", { name: "切换发言" }));

    expect(onTeamSelect).toHaveBeenCalledWith("negative");
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });

  it("locks switching when waiting for host permission", () => {
    renderWithProviders(
      <UltimatePkPanel
        {...createProps({
          stageLocked: true,
        })}
      />
    );

    expect(screen.getByText("等待主持人允许切换")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切换发言" })).toBeDisabled();
  });

  it("shows cooling state when throttle is active", () => {
    renderWithProviders(
      <UltimatePkPanel
        {...createProps({
          throttleActive: true,
        })}
      />
    );

    expect(screen.getByText("切换冷却中，请稍候")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切换发言" })).toBeDisabled();
  });

  it("shows sending state and busy attribute while dispatching switch command", () => {
    renderWithProviders(
      <UltimatePkPanel
        {...createProps({
          sending: true,
        })}
      />
    );

    expect(screen.getByText("正在发送切换指令...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切换发言" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "切换发言" })).toHaveAttribute(
      "aria-busy",
      "true"
    );
  });
});
