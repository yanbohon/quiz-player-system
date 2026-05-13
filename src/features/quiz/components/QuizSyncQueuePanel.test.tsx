import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { QuizSyncQueuePanel, type QuizSyncQueuePanelProps } from "./QuizSyncQueuePanel";

const mocks = vi.hoisted(() => ({
  dialogConfirm: vi.fn(),
}));

vi.mock("@arco-design/mobile-react", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) =>
    createElement(
      "button",
      {
        type: "button",
        onClick,
        disabled,
      },
      children
    ),
}));

vi.mock("@/lib/arco", () => ({
  Dialog: {
    confirm: mocks.dialogConfirm,
  },
}));

function createProps(
  overrides: Partial<QuizSyncQueuePanelProps> = {}
): QuizSyncQueuePanelProps {
  return {
    pending: 2,
    failed: 1,
    failedItems: [
      {
        id: "job-1",
        label: "第 3 题提交",
        attempts: 2,
        lastErrorMessage: "网络超时",
        details: {
          stageLabel: "抢答冲刺",
          questionLabel: "第 3 题",
          answerLabel: "A",
        },
      },
    ],
    showDetails: false,
    onToggleDetails: vi.fn(),
    onRetry: vi.fn(),
    onDeleteFailedItem: vi.fn(),
    ...overrides,
  };
}

function renderPanel(props: QuizSyncQueuePanelProps) {
  return renderWithProviders(createElement(QuizSyncQueuePanel, props));
}

describe("QuizSyncQueuePanel", () => {
  it("renders queue counts and triggers detail and retry actions", async () => {
    mocks.dialogConfirm.mockReset();
    const onToggleDetails = vi.fn();
    const onRetry = vi.fn();
    const { user } = renderPanel(
      createProps({
        onToggleDetails,
        onRetry,
      })
    );

    expect(screen.getByText("成绩上传队列")).toBeInTheDocument();
    expect(screen.getByText("待处理 2")).toBeInTheDocument();
    expect(screen.getByText("失败 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "详情" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "重试" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "详情" }));
    await user.click(screen.getByRole("button", { name: "重试" }));

    expect(onToggleDetails).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows empty details and disables retry when there are no failed jobs", async () => {
    mocks.dialogConfirm.mockReset();
    const onRetry = vi.fn();
    const { user } = renderPanel(
      createProps({
        failed: 0,
        failedItems: [],
        showDetails: true,
        onRetry,
      })
    );

    expect(screen.getByRole("button", { name: "收起" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "重试" })).toBeDisabled();
    expect(screen.getByText("当前无失败任务")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("renders failed item details when expanded", () => {
    mocks.dialogConfirm.mockReset();
    renderPanel(
      createProps({
        pending: 3,
        failed: 2,
        failedItems: [
          {
            id: "job-1",
            label: "第 3 题提交",
            attempts: 2,
            lastErrorMessage: "网络超时",
            details: {
              stageLabel: "抢答冲刺",
              questionLabel: "第 3 题",
              answerLabel: "A",
            },
          },
          {
            id: "job-2",
            label: "第 4 题提交",
            attempts: 1,
            details: {
              stageLabel: "抢答冲刺",
              questionLabel: "第 4 题",
              answerLabel: "B",
            },
          },
        ],
        showDetails: true,
      })
    );

    expect(screen.getByText("第 3 题提交")).toBeInTheDocument();
    expect(screen.getByText("第 4 题提交")).toBeInTheDocument();
    expect(screen.getAllByText("抢答冲刺")).toHaveLength(2);
    expect(screen.getByText("第 3 题")).toBeInTheDocument();
    expect(screen.getByText("第 4 题")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("尝试 2")).toBeInTheDocument();
    expect(screen.getByText("尝试 1")).toBeInTheDocument();
    expect(screen.getByText("网络超时")).toBeInTheDocument();
  });

  it("confirms before deleting a failed item", async () => {
    mocks.dialogConfirm.mockReset();
    const onDeleteFailedItem = vi.fn();
    const onRetry = vi.fn();
    const { user } = renderPanel(
      createProps({
        showDetails: true,
        onRetry,
        onDeleteFailedItem,
      })
    );

    await user.click(screen.getByRole("button", { name: "删除" }));

    expect(mocks.dialogConfirm).toHaveBeenCalledTimes(1);
    const dialogConfig = mocks.dialogConfirm.mock.calls[0]?.[0] as {
      onOk?: () => void;
      title?: string;
      children?: string;
    };
    expect(dialogConfig.title).toBe("确认删除失败任务？");
    expect(dialogConfig.children).toContain("环节：抢答冲刺");
    expect(dialogConfig.children).toContain("题号：第 3 题");

    dialogConfig.onOk?.();
    expect(onDeleteFailedItem).toHaveBeenCalledWith("job-1");
    expect(onRetry).not.toHaveBeenCalled();
  });
});
