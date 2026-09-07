import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import AdminApp from "./App";

const api = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  rotatePassword: vi.fn(),
  me: vi.fn(),
  dashboard: vi.fn(),
  listMembers: vi.fn(),
  updateMember: vi.fn(),
  generateInviteCodes: vi.fn(),
  setInviteCodeEnabled: vi.fn(),
  generateRechargeCodes: vi.fn(),
  setRechargeCodeEnabled: vi.fn(),
  listPackages: vi.fn(),
  createPackage: vi.fn(),
  updatePackage: vi.fn(),
  deletePackage: vi.fn(),
  listProviders: vi.fn(),
  upsertProvider: vi.fn(),
  updateProvider: vi.fn(),
  setProviderSecret: vi.fn(),
  listPartnerKeys: vi.fn(),
  addPartnerKey: vi.fn(),
  updatePartnerKey: vi.fn(),
  deletePartnerKey: vi.fn(),
  listTutorials: vi.fn(),
  createTutorial: vi.fn(),
  updateTutorial: vi.fn(),
  deleteTutorial: vi.fn(),
  publishTutorial: vi.fn(),
  listAnnouncements: vi.fn(),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
  publishAnnouncement: vi.fn(),
  getRiskPolicy: vi.fn(),
  updateRiskPolicy: vi.fn(),
  listAudit: vi.fn(),
  exportAudit: vi.fn(),
}));

vi.mock("./api", () => ({
  controlApi: api,
  displayError: (error: unknown) => ({
    message: error instanceof Error ? error.message : "控制面请求失败",
    code: error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : undefined,
  }),
  readEnvironment: () => ({ environment: "test", adapterState: "ready", adapterLabel: "测试适配器" }),
}));

const admin = {
  id: "admin-1",
  username: "root.operator",
  displayName: "值班管理员",
  role: "super_admin",
  mustRotatePassword: false,
};

const dashboard = {
  generatedAt: "2026-09-02T08:00:00.000Z",
  metrics: { pendingInterventions: 1, activeTasks: 7, activeMembers: 23, pendingReviews: 2 },
  interventions: [{ id: "risk-1", title: "风险策略待复核", summary: "高影响策略变更", module: "risk", severity: "warning" }],
  providers: [{ id: "provider-1", name: "控制面适配器", status: "ready", message: "测试连接" }],
  recentAudit: [],
};

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) { this.setAttribute("open", ""); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) { this.removeAttribute("open"); },
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "#/dashboard");
  api.logout.mockResolvedValue(undefined);
  api.dashboard.mockResolvedValue(dashboard);
  api.listMembers.mockResolvedValue([]);
  api.listPackages.mockResolvedValue([]);
  api.listProviders.mockResolvedValue([]);
  api.listPartnerKeys.mockResolvedValue([]);
  api.listTutorials.mockResolvedValue([]);
  api.listAnnouncements.mockResolvedValue([]);
  api.listAudit.mockResolvedValue([]);
  api.getRiskPolicy.mockResolvedValue({});
});

afterEach(() => cleanup());

describe("independent super-admin application", () => {
  it("shows the dedicated login when there is no admin session", async () => {
    api.me.mockRejectedValueOnce(new Error("UNAUTHENTICATED"));
    render(<AdminApp />);

    expect(await screen.findByRole("heading", { name: "验证治理身份" })).toBeInTheDocument();
    expect(screen.getByText("此入口仅接受超级管理员账号，普通会员不会被降级导入。")).toBeInTheDocument();
    expect(api.dashboard).not.toHaveBeenCalled();
  });

  it("logs in and loads the real dashboard", async () => {
    const user = userEvent.setup();
    api.me.mockRejectedValueOnce(new Error("UNAUTHENTICATED")).mockResolvedValueOnce(admin);
    api.login.mockResolvedValue(admin);
    render(<AdminApp />);

    await user.type(await screen.findByLabelText("管理员账号"), "root.operator");
    await user.type(screen.getByLabelText("访问密码"), "CorrectHorse2026");
    await user.click(screen.getByRole("button", { name: "进入治理中枢" }));

    expect(await screen.findByRole("heading", { name: "待介入优先的治理总览" })).toBeInTheDocument();
    expect(screen.getByText("风险策略待复核")).toBeInTheDocument();
    expect(api.login).toHaveBeenCalledWith({ username: "root.operator", password: "CorrectHorse2026" });
    expect(api.dashboard).toHaveBeenCalledTimes(1);
  });

  it("blocks all governance data behind mandatory password rotation", async () => {
    api.me.mockResolvedValueOnce({ ...admin, mustRotatePassword: true });
    render(<AdminApp />);

    expect(await screen.findByRole("heading", { name: "必须轮换初始密码" })).toBeInTheDocument();
    expect(screen.getByText(/完成轮换前不会加载任何治理数据/)).toBeInTheDocument();
    expect(api.dashboard).not.toHaveBeenCalled();
  });

  it("opens command search with the keyboard and navigates to audit", async () => {
    const user = userEvent.setup();
    api.me.mockResolvedValueOnce(admin);
    render(<AdminApp />);
    await screen.findByRole("heading", { name: "待介入优先的治理总览" });

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const palette = await screen.findByRole("dialog", { name: "全局命令搜索" });
    await user.type(within(palette).getByPlaceholderText("搜索模块、操作或能力…"), "审计");
    await user.click(within(palette).getByRole("button", { name: /审计/ }));

    await waitFor(() => expect(within(screen.getByRole("main")).getByRole("heading", { name: "审计" })).toBeInTheDocument());
    expect(api.listAudit).toHaveBeenCalled();
  });

  it("requires confirmation for destructive writes and surfaces API failure", async () => {
    const user = userEvent.setup();
    api.me.mockResolvedValueOnce(admin);
    api.listPackages.mockResolvedValueOnce([{
      id: "pkg-1",
      name: "商用旗舰",
      description: "高额度套餐",
      credits: 1000,
      price: 399,
      enabled: true,
    }]);
    api.deletePackage.mockRejectedValueOnce(new Error("服务端拒绝删除：套餐仍被账本引用"));
    window.history.replaceState(null, "", "#/packages");
    render(<AdminApp />);

    await waitFor(() => expect(within(screen.getByRole("main")).getByRole("heading", { name: "套餐" })).toBeInTheDocument());
    await user.click(await screen.findByRole("button", { name: "删除" }));
    const dialog = await screen.findByRole("dialog", { name: /删除套餐/ });
    expect(api.deletePackage).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "确认删除套餐" }));

    await waitFor(() => expect(api.deletePackage).toHaveBeenCalledWith("pkg-1"));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("服务端拒绝删除");
  });
});
