import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import { Button, ConfirmDialog, ProgressRing } from "./primitives";

function renderShell(
  overrides: Partial<React.ComponentProps<typeof AppShell>> = {},
) {
  const onNavigate = vi.fn();
  const onLogout = vi.fn();
  render(
    <AppShell
      role="user"
      userName="林雅"
      credits={128}
      unreadCount={3}
      activeView="dashboard"
      onNavigate={onNavigate}
      onLogout={onLogout}
      {...overrides}
    >
      <div>工作区内容</div>
    </AppShell>,
  );
  return { onNavigate, onLogout };
}

describe("AppShell", () => {
  it("routes every top-level utility to a real view", async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderShell();

    await user.click(screen.getByRole("button", { name: /星核创作：创建批量视频任务/ }));
    await user.click(screen.getByRole("button", { name: "可用能量 128" }));
    await user.click(screen.getByRole("button", { name: "查看消息，3 条未读" }));

    expect(onNavigate).toHaveBeenNthCalledWith(1, "create");
    expect(onNavigate).toHaveBeenNthCalledWith(2, "wallet");
    expect(onNavigate).toHaveBeenNthCalledWith(3, "notifications");
  });

  it("supports sidebar collapse and an escape-close mobile drawer", async () => {
    const user = userEvent.setup();
    renderShell();

    const collapse = screen.getByRole("button", { name: "收起侧边栏" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    await user.click(collapse);
    expect(screen.getByRole("button", { name: "展开侧边栏" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "打开导航菜单" }));
    expect(screen.getByRole("dialog", { name: "移动主导航" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "移动主导航" })).not.toBeInTheDocument();
  });

  it("exposes the dedicated administration information architecture", () => {
    renderShell({ role: "admin", activeView: "admin-overview" });

    expect(screen.getByRole("button", { name: /用户治理：账户、权限与状态/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /安全审计：操作日志与风控记录/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /星核创作：/ })).not.toBeInTheDocument();
  });

  it("keeps logout wired to the supplied action", async () => {
    const user = userEvent.setup();
    const { onLogout } = renderShell();
    await user.click(screen.getByRole("button", { name: "退出登录" }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});

describe("app primitives", () => {
  it("communicates loading and bounded progress states", () => {
    render(
      <>
        <Button loading loadingLabel="正在生成">生成</Button>
        <ProgressRing value={160} />
      </>,
    );

    expect(screen.getByRole("button", { name: "正在生成" })).toBeDisabled();
    expect(screen.getByRole("progressbar", { name: "完成 100%" })).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
  });

  it("runs confirmation and closes the modal", async () => {
    const user = userEvent.setup();
    const confirm = vi.fn().mockResolvedValue(undefined);

    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <ConfirmDialog
          open={open}
          title="终止任务"
          description="已生成的片段会被保留。"
          confirmLabel="确认终止"
          onConfirm={confirm}
          onClose={() => setOpen(false)}
        />
      );
    }

    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "确认终止" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
