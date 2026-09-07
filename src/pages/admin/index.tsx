import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Bell,
  BookOpenText,
  CaretRight,
  ChartLineUp,
  CheckCircle,
  ClipboardText,
  CloudSlash,
  Coins,
  Copy,
  Cpu,
  Database,
  FloppyDisk,
  GearSix,
  HandCoins,
  HardDrives,
  Info,
  Key,
  ListChecks,
  LockKey,
  MagnifyingGlass,
  Package,
  PaperPlaneTilt,
  Plus,
  Pulse,
  ShieldCheck,
  Snowflake,
  StopCircle,
  Sun,
  Ticket,
  Trash,
  UserCircleGear,
  UsersThree,
  Warning,
  XCircle,
} from "@phosphor-icons/react";
import "../../styles/admin.css";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useAppStore } from "../../state/AppStore";
import type {
  AdminSettings,
  Announcement,
  AnnouncementType,
  AuditModule,
  FeedbackStatus,
  GenerationTask,
  Material,
  TaskStatus,
  Tutorial,
  TutorialCategory,
  User,
  UserRole,
  WithdrawalStatus,
} from "../../types/domain";
import "../../styles/admin.css";

export type AdminWorkspaceProps = {
  view: string;
  onNavigate: (view: string) => void;
};

type AdminView =
  | "overview"
  | "users"
  | "codes"
  | "platforms"
  | "tasks"
  | "materials"
  | "finance"
  | "content"
  | "audit"
  | "settings";

type Outcome = { ok: boolean; message: string };

type PendingConfirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "danger" | "warning";
  action: () => Outcome;
};

type Notice = { tone: "success" | "error"; message: string } | null;

const NAV_ITEMS: Array<{
  id: AdminView;
  label: string;
  description: string;
  icon: ReactNode;
}> = [
  { id: "overview", label: "控制塔台", description: "运营分析", icon: <ChartLineUp /> },
  { id: "users", label: "身份矩阵", description: "用户与权限", icon: <UsersThree /> },
  { id: "codes", label: "额度铸造", description: "套餐与卡密", icon: <Ticket /> },
  { id: "platforms", label: "模型星图", description: "六平台就绪度", icon: <Cpu /> },
  { id: "tasks", label: "任务轨道", description: "全局任务监控", icon: <ListChecks /> },
  { id: "materials", label: "素材穹顶", description: "资料与回收站", icon: <HardDrives /> },
  { id: "finance", label: "分润结算", description: "分销与提现", icon: <HandCoins /> },
  { id: "content", label: "内容中继", description: "教程与反馈", icon: <BookOpenText /> },
  { id: "audit", label: "审计回廊", description: "操作追溯", icon: <ShieldCheck /> },
  { id: "settings", label: "系统核心", description: "全局策略", icon: <GearSix /> },
];

const VIEW_ALIASES: Record<string, AdminView> = {
  admin: "overview",
  dashboard: "overview",
  analytics: "overview",
  overview: "overview",
  users: "users",
  user: "users",
  accounts: "users",
  codes: "codes",
  recharge: "codes",
  packages: "codes",
  invites: "codes",
  platforms: "platforms",
  providers: "platforms",
  api: "platforms",
  tasks: "tasks",
  monitor: "tasks",
  materials: "materials",
  recycle: "materials",
  finance: "finance",
  distribution: "finance",
  withdrawals: "finance",
  content: "content",
  tutorials: "content",
  announcements: "content",
  feedback: "content",
  audit: "audit",
  logs: "audit",
  settings: "settings",
  system: "settings",
};

const TASK_LABELS: Record<TaskStatus, string> = {
  pending: "待创建",
  queued: "排队中",
  processing: "生成中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
  terminated: "已终止",
};

const ROLE_LABELS: Record<UserRole, string> = {
  user: "创作者",
  agent: "代理",
  admin: "管理员",
};

const MODULE_LABELS: Record<AuditModule, string> = {
  auth: "身份认证",
  platform: "平台连接",
  invite: "邀请体系",
  recharge: "充值额度",
  content: "内容运营",
  risk: "风险控制",
  withdrawal: "提现审核",
  settings: "系统设置",
  task: "任务管理",
  material: "素材管理",
  feedback: "用户反馈",
};

const MATERIAL_LABELS: Record<Material["type"], string> = {
  photo: "人物照片",
  product: "商品素材",
  audio: "音频",
  voice: "音色模型",
  project: "项目",
  video: "成片",
  subtitle: "字幕",
};

const TUTORIAL_CATEGORY_LABELS: Record<TutorialCategory, string> = {
  getting_started: "快速开始",
  api_binding: "API 绑定",
  video_creation: "视频创作",
  affiliate: "分销推广",
  faq: "常见问题",
};

const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  pending: "待处理",
  processing: "处理中",
  adopted: "已采纳",
  closed: "已关闭",
};

function normalizeView(view: string): AdminView {
  const normalized = view
    .toLowerCase()
    .replace(/^\/?admin(?:[-/:])?/, "")
    .split(/[/?#]/)[0];
  return VIEW_ALIASES[normalized] ?? VIEW_ALIASES[view.toLowerCase()] ?? "overview";
}

function formatDate(value?: string, includeTime = true): string {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(date);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatBytes(value?: number): string {
  if (!value) return "暂无";
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function statusTone(status: string): "success" | "warning" | "danger" | "muted" | "info" {
  if (["active", "connected", "completed", "approved", "adopted", "success"].includes(status)) {
    return "success";
  }
  if (["processing", "queued", "pending", "degraded"].includes(status)) return "warning";
  if (["failed", "error", "frozen", "rejected", "terminated"].includes(status)) return "danger";
  if (["cancelled", "disabled", "expired", "closed", "disconnected"].includes(status)) return "muted";
  return "info";
}

function Badge({ tone = "muted", children }: { tone?: ReturnType<typeof statusTone>; children: ReactNode }) {
  return <span className={`admin-badge admin-badge--${tone}`}>{children}</span>;
}

function EmptyState({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) {
  return (
    <div className="admin-empty">
      <span className="admin-empty__icon" aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}

function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="admin-section-heading">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action ? <div className="admin-section-heading__action">{action}</div> : null}
    </div>
  );
}

function ConfirmDialog({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: PendingConfirmation | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (pending && !dialog.open) dialog.showModal();
    if (!pending && dialog.open) dialog.close();
  }, [pending]);

  return (
    <dialog
      ref={dialogRef}
      className="admin-confirm"
      aria-labelledby="admin-confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClose={onCancel}
    >
      {pending ? (
        <div className="admin-confirm__shell">
          <div className={`admin-confirm__sigil admin-confirm__sigil--${pending.tone ?? "warning"}`}>
            {pending.tone === "danger" ? <Warning /> : <ShieldCheck />}
          </div>
          <div>
            <h2 id="admin-confirm-title">{pending.title}</h2>
            <p>{pending.description}</p>
          </div>
          <div className="admin-confirm__actions">
            <button className="admin-button admin-button--ghost" type="button" onClick={onCancel}>
              返回检查
            </button>
            <button
              className={`admin-button ${pending.tone === "danger" ? "admin-button--danger" : "admin-button--primary"}`}
              type="button"
              onClick={onConfirm}
            >
              {pending.confirmLabel}
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

function SwitchField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="admin-switch-field">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="admin-switch" aria-hidden="true"><span /></span>
    </label>
  );
}

function OverviewView({ onNavigate }: { onNavigate: (view: string) => void }) {
  const { state } = useAppStore();
  const activeTasks = state.tasks.filter((task) => ["pending", "queued", "processing"].includes(task.status));
  const completedTasks = state.tasks.filter((task) => task.status === "completed");
  const failedTasks = state.tasks.filter((task) => task.status === "failed");
  const frozenUsers = state.users.filter((user) => user.status === "frozen");
  const pendingWithdrawals = state.withdrawalRequests.filter((request) => request.status === "pending");
  const completionRate = state.tasks.length
    ? Math.round((completedTasks.length / state.tasks.length) * 100)
    : 0;
  const providerLoad = state.platforms.map((platform) => ({
    platform,
    tasks: state.tasks.filter((task) => task.platformId === platform.id).length,
    active: activeTasks.filter((task) => task.platformId === platform.id).length,
  }));
  const maxProviderTasks = Math.max(1, ...providerLoad.map((item) => item.tasks));

  return (
    <div className="admin-view admin-view--overview">
      <section className="admin-command-surface">
        <div className="admin-command-surface__copy">
          <span className="admin-live-signal"><i />系统脉冲稳定 · 本地演示数据</span>
          <h2>全域生产控制塔</h2>
          <p>把用户、额度、模型平台与视频任务收束到同一条可追溯的运营链路。</p>
          <div className="admin-command-surface__actions">
            <button className="admin-button admin-button--primary" type="button" onClick={() => onNavigate("admin-tasks")}>
              <Pulse />进入任务监控
            </button>
            <button className="admin-button admin-button--ghost" type="button" onClick={() => onNavigate("admin-audit")}>
              <ShieldCheck />审计最近操作
            </button>
          </div>
        </div>
        <div className="admin-command-surface__pulse" aria-label={`当前 ${activeTasks.length} 个任务运行中`}>
          <div className="admin-pulse-orbit"><span>{activeTasks.length}</span></div>
          <strong>运行轨道</strong>
          <small>并发上限 {state.adminSettings.maxConcurrentTasks}</small>
        </div>
        <dl className="admin-command-stats">
          <div><dt>完成率</dt><dd>{completionRate}%</dd></div>
          <div><dt>累计任务</dt><dd>{state.tasks.length}</dd></div>
          <div><dt>冻结身份</dt><dd>{frozenUsers.length}</dd></div>
          <div><dt>待审提现</dt><dd>{pendingWithdrawals.length}</dd></div>
        </dl>
      </section>

      <div className="admin-overview-columns">
        <section className="admin-panel admin-panel--wide">
          <SectionHeading title="模型负载星图" description="按已登记任务统计；不代表生产接口真实可用。" />
          <div className="admin-load-chart">
            {providerLoad.map(({ platform, tasks, active }) => (
              <div className="admin-load-row" key={platform.id}>
                <div className="admin-load-row__label">
                  <span className="admin-platform-mark"><i>{platform.shortName}</i></span>
                  <span><strong>{platform.name}</strong><small>{active ? `${active} 个运行中` : "当前无运行任务"}</small></span>
                </div>
                <div className="admin-load-row__track" aria-label={`${platform.name} 共 ${tasks} 个任务`}>
                  <i style={{ width: `${Math.max(tasks ? 12 : 2, (tasks / maxProviderTasks) * 100)}%` }} />
                </div>
                <b>{tasks}</b>
              </div>
            ))}
          </div>
        </section>

        <aside className="admin-panel admin-risk-panel">
          <SectionHeading title="需要介入" description="按风险优先级聚合。" />
          <button className="admin-risk-item" type="button" onClick={() => onNavigate("admin-tasks")}>
            <span className="admin-risk-item__icon"><Warning /></span>
            <span><strong>{failedTasks.length} 个失败任务</strong><small>查看错误码与无损重试条件</small></span>
            <CaretRight />
          </button>
          <button className="admin-risk-item" type="button" onClick={() => onNavigate("admin-finance")}>
            <span className="admin-risk-item__icon"><Coins /></span>
            <span><strong>{pendingWithdrawals.length} 笔待审提现</strong><small>确认人工转账后再放行</small></span>
            <CaretRight />
          </button>
          <button className="admin-risk-item" type="button" onClick={() => onNavigate("admin-platforms")}>
            <span className="admin-risk-item__icon"><CloudSlash /></span>
            <span><strong>6 个生产适配器未配置</strong><small>演示连接不等于真实接口就绪</small></span>
            <CaretRight />
          </button>
        </aside>
      </div>

      <section className="admin-panel">
        <SectionHeading
          title="最近任务流"
          description="全平台最近更新的生产任务。"
          action={<button className="admin-text-button" type="button" onClick={() => onNavigate("admin-tasks")}>查看全部 <CaretRight /></button>}
        />
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>任务</th><th>创建者</th><th>平台</th><th>状态</th><th>进度</th><th>更新时间</th></tr></thead>
            <tbody>
              {[...state.tasks]
                .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
                .slice(0, 6)
                .map((task) => {
                  const owner = state.users.find((user) => user.id === task.userId);
                  const platform = state.platforms.find((item) => item.id === task.platformId);
                  return (
                    <tr key={task.id}>
                      <td><strong className="admin-primary-cell">{task.title}</strong><small>{task.id}</small></td>
                      <td>{owner?.nickname ?? "未知用户"}</td>
                      <td>{platform?.name ?? "未知平台"}</td>
                      <td><Badge tone={statusTone(task.status)}>{TASK_LABELS[task.status]}</Badge></td>
                      <td><span className="admin-progress"><i style={{ width: `${task.progress}%` }} /></span><small>{task.progress}%</small></td>
                      <td>{formatDate(task.updatedAt)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function UsersView({
  requestConfirmation,
  notify,
}: {
  requestConfirmation: (confirmation: PendingConfirmation) => void;
  notify: (outcome: Outcome) => void;
}) {
  const { state, currentUser, updateUserByAdmin } = useAppStore();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");
  const [selectedId, setSelectedId] = useState(state.users[0]?.id ?? "");
  const [quotaDraft, setQuotaDraft] = useState("");
  const [creditDelta, setCreditDelta] = useState("");
  const [freezeRemark, setFreezeRemark] = useState("");

  const users = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return state.users.filter((user) => {
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const matchesSearch = !keyword || [user.username, user.nickname, user.phone, user.id]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(keyword));
      return matchesRole && matchesSearch;
    });
  }, [roleFilter, search, state.users]);

  const selected = users.find((user) => user.id === selectedId) ?? users[0];

  useEffect(() => {
    if (!selected) return;
    setQuotaDraft(String(selected.selfApiDailyLimit));
    setCreditDelta("");
    setFreezeRemark(selected.freezeRemark ?? "");
  }, [selected?.id, selected?.selfApiDailyLimit, selected?.freezeRemark]);

  const changeRole = (user: User, role: UserRole) => {
    requestConfirmation({
      title: "确认变更账号角色",
      description: `将「${user.nickname}」从${ROLE_LABELS[user.role]}调整为${ROLE_LABELS[role]}。角色权限会立即变化并写入审计日志。`,
      confirmLabel: "确认变更角色",
      tone: role === "admin" ? "warning" : "danger",
      action: () => updateUserByAdmin(user.id, { role }),
    });
  };

  const toggleFreeze = (user: User) => {
    const freezing = user.status === "active";
    requestConfirmation({
      title: freezing ? "冻结此账号并终止活动任务？" : "解除账号冻结？",
      description: freezing
        ? `「${user.nickname}」的活动会话将撤销，运行中的任务会无扣费终止。原因：${freezeRemark.trim() || "未填写具体原因"}`
        : `「${user.nickname}」将恢复登录权限，但被终止的任务不会自动恢复。`,
      confirmLabel: freezing ? "确认冻结账号" : "确认解除冻结",
      tone: freezing ? "danger" : "warning",
      action: () => updateUserByAdmin(user.id, {
        status: freezing ? "frozen" : "active",
        freezeRemark: freezing ? freezeRemark.trim() || "管理员人工冻结" : undefined,
      }),
    });
  };

  const saveQuotaAndCredits = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    const quota = Number(quotaDraft);
    const delta = Number(creditDelta || 0);
    if (!Number.isFinite(quota) || quota < 0 || !Number.isInteger(quota)) {
      notify({ ok: false, message: "自有 API 日配额必须是大于等于 0 的整数。" });
      return;
    }
    if (!Number.isFinite(delta) || !Number.isInteger(delta) || Math.abs(delta) > 100000) {
      notify({ ok: false, message: "额度调整需为 ±100000 范围内的整数。" });
      return;
    }
    requestConfirmation({
      title: "确认写入用户额度",
      description: `「${selected.nickname}」日配额将设为 ${quota}，付费额度将${delta >= 0 ? "增加" : "减少"} ${Math.abs(delta)} 次。调整结果不可自动撤回。`,
      confirmLabel: "确认写入额度",
      tone: delta < 0 ? "danger" : "warning",
      action: () => updateUserByAdmin(selected.id, {
        selfApiDailyLimit: quota,
        paidCreditsDelta: delta,
      }),
    });
  };

  return (
    <div className="admin-view">
      <SectionHeading title="身份与权限矩阵" description="搜索账号、调整角色与额度，并对异常身份实施可追溯风控。" />
      <div className="admin-toolbar">
        <label className="admin-search"><MagnifyingGlass /><span className="sr-only">搜索用户</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索昵称、账号、手机或 ID" /></label>
        <label className="admin-select-field"><span>角色</span><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as "all" | UserRole)}><option value="all">全部角色</option><option value="user">创作者</option><option value="agent">代理</option><option value="admin">管理员</option></select></label>
        <span className="admin-toolbar__count">找到 {users.length} 个身份</span>
      </div>

      <div className="admin-master-detail">
        <section className="admin-panel admin-panel--flush">
          <div className="admin-table-wrap">
            <table className="admin-table admin-table--interactive">
              <thead><tr><th>用户</th><th>角色</th><th>状态</th><th>付费额度</th><th>自有 API</th><th>最近登录</th></tr></thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className={selected?.id === user.id ? "is-selected" : ""}>
                    <td><button className="admin-user-cell" type="button" onClick={() => setSelectedId(user.id)}><span><i>{user.avatarInitials}</i></span><span><strong>{user.nickname}</strong><small>@{user.username}</small></span></button></td>
                    <td>{ROLE_LABELS[user.role]}</td>
                    <td><Badge tone={statusTone(user.status)}>{user.status === "active" ? "正常" : "已冻结"}</Badge></td>
                    <td className="admin-numeric">{user.paidCredits}</td>
                    <td className="admin-numeric">{user.selfApiCallsToday}/{user.selfApiDailyLimit}</td>
                    <td>{formatDate(user.lastLoginAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!users.length ? <EmptyState icon={<UsersThree />} title="没有匹配账号" copy="尝试缩短关键词或切换角色筛选。" /> : null}
        </section>

        <aside className="admin-inspector">
          {selected ? (
            <>
              <div className="admin-inspector__identity">
                <span><i>{selected.avatarInitials}</i></span>
                <div><h3>{selected.nickname}</h3><p>{selected.id} · @{selected.username}</p></div>
                <Badge tone={statusTone(selected.status)}>{selected.status === "active" ? "正常" : "冻结"}</Badge>
              </div>
              <dl className="admin-detail-list">
                <div><dt>手机号</dt><dd>{selected.phone ? `${selected.phone.slice(0, 3)}****${selected.phone.slice(-4)}` : "未绑定"}</dd></div>
                <div><dt>认证来源</dt><dd>{selected.authKind === "demo" ? "内置演示身份" : "本地注册"}</dd></div>
                <div><dt>创建时间</dt><dd>{formatDate(selected.createdAt)}</dd></div>
                <div><dt>最近 IP</dt><dd>{selected.lastLoginIp ?? "暂无记录"}</dd></div>
              </dl>

              <div className="admin-inspector__section">
                <label className="admin-field"><span>账号角色</span><select value={selected.role} disabled={selected.id === currentUser?.id} title={selected.id === currentUser?.id ? "当前管理员不可在此自降级，避免失去管理权限" : undefined} onChange={(event) => changeRole(selected, event.target.value as UserRole)}><option value="user">创作者</option><option value="agent">代理</option><option value="admin">管理员</option></select><small>{selected.id === currentUser?.id ? "为避免管理锁死，当前身份不可自降级。" : "角色变更需要二次确认。"}</small></label>
              </div>

              <form className="admin-inspector__section" onSubmit={saveQuotaAndCredits}>
                <div className="admin-field-row">
                  <label className="admin-field"><span>自有 API 日配额</span><input type="number" min="0" step="1" value={quotaDraft} onChange={(event) => setQuotaDraft(event.target.value)} /></label>
                  <label className="admin-field"><span>付费额度增减</span><input type="number" step="1" value={creditDelta} onChange={(event) => setCreditDelta(event.target.value)} placeholder="如 50 或 -20" /></label>
                </div>
                <button className="admin-button admin-button--secondary" type="submit"><Coins />复核并写入额度</button>
              </form>

              <div className="admin-inspector__section">
                <label className="admin-field"><span>冻结原因</span><textarea value={freezeRemark} onChange={(event) => setFreezeRemark(event.target.value)} rows={3} placeholder="说明风控依据，便于审计追溯" disabled={selected.status === "frozen"} /></label>
                <button className={`admin-button ${selected.status === "active" ? "admin-button--danger-ghost" : "admin-button--secondary"}`} type="button" disabled={selected.id === currentUser?.id} title={selected.id === currentUser?.id ? "不能冻结当前登录的管理员账号" : undefined} onClick={() => toggleFreeze(selected)}>
                  {selected.status === "active" ? <Snowflake /> : <Sun />}{selected.status === "active" ? "复核并冻结账号" : "解除账号冻结"}
                </button>
              </div>
            </>
          ) : <EmptyState icon={<UserCircleGear />} title="选择一个身份" copy="从左侧列表打开权限检查器。" />}
        </aside>
      </div>
    </div>
  );
}

function CodesView({ notify }: { notify: (outcome: Outcome) => void }) {
  const { state, createRechargeCodes, createInviteCode } = useAppStore();
  const [packageId, setPackageId] = useState(state.packageTemplates.find((item) => item.isActive)?.id ?? "");
  const [count, setCount] = useState("5");
  const [expiresOn, setExpiresOn] = useState("");
  const [inviteUses, setInviteUses] = useState("20");
  const [inviteGift, setInviteGift] = useState("3");
  const [codeFilter, setCodeFilter] = useState("all");
  const [latestCodes, setLatestCodes] = useState<string[]>([]);

  const copyText = async (value: string, success: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify({ ok: true, message: success });
    } catch {
      notify({ ok: false, message: "浏览器未授予剪贴板权限，请手动选择复制。" });
    }
  };

  const generateRecharge = (event: FormEvent) => {
    event.preventDefault();
    const parsedCount = Number(count);
    if (!Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 100) {
      notify({ ok: false, message: "单批充值码数量必须为 1–100。" });
      return;
    }
    const expiry = expiresOn ? new Date(`${expiresOn}T23:59:59`).toISOString() : undefined;
    const result = createRechargeCodes(packageId, parsedCount, expiry);
    notify(result);
    if (result.ok && result.data) setLatestCodes(result.data.map((item) => item.code));
  };

  const generateInvite = (event: FormEvent) => {
    event.preventDefault();
    const uses = Number(inviteUses);
    const gift = Number(inviteGift);
    if (!Number.isInteger(uses) || uses < 1 || uses > 500 || !Number.isInteger(gift) || gift < 0 || gift > 20) {
      notify({ ok: false, message: "邀请次数需为 1–500，赠送额度需为 0–20。" });
      return;
    }
    const result = createInviteCode(uses, gift);
    notify(result);
    if (result.ok && result.data) setLatestCodes([result.data]);
  };

  const displayedCodes = state.rechargeCodes.filter((code) => codeFilter === "all" || code.status === codeFilter);

  return (
    <div className="admin-view">
      <SectionHeading title="额度铸造与授权码" description="套餐只定义面值；生成的充值码和邀请码独立记录、可逐笔追溯。" />

      <div className="admin-package-ribbon">
        {state.packageTemplates.map((item) => (
          <button key={item.id} type="button" className={`admin-package ${packageId === item.id ? "is-selected" : ""}`} disabled={!item.isActive} title={!item.isActive ? "该套餐已停用，不能生成充值码" : `选择${item.name}`} onClick={() => setPackageId(item.id)}>
            <span className="admin-package__mark"><Package /></span>
            <span><small>{item.subtitle}</small><strong>{item.name}</strong><em>{formatMoney(item.value)} · {item.credits} 次</em></span>
            {item.badge ? <Badge tone="info">{item.badge}</Badge> : null}
          </button>
        ))}
      </div>

      <div className="admin-split-layout">
        <section className="admin-panel">
          <SectionHeading title="生成充值码" description="仅创建本地可兑换凭证，不会触发真实支付。" />
          <form className="admin-form-grid" onSubmit={generateRecharge}>
            <label className="admin-field"><span>选择套餐</span><select value={packageId} onChange={(event) => setPackageId(event.target.value)}>{state.packageTemplates.filter((item) => item.isActive).map((item) => <option value={item.id} key={item.id}>{item.name} · {item.credits} 次</option>)}</select></label>
            <label className="admin-field"><span>生成数量</span><input type="number" min="1" max="100" step="1" value={count} onChange={(event) => setCount(event.target.value)} /></label>
            <label className="admin-field"><span>失效日期（可选）</span><input type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} /></label>
            <button className="admin-button admin-button--primary admin-form-grid__submit" type="submit" disabled={!packageId} title={!packageId ? "没有可用套餐" : undefined}><Plus />生成充值码</button>
          </form>
        </section>

        <section className="admin-panel">
          <SectionHeading title="生成邀请码" description="邀请关系注册后永久绑定；赠送额度有上限。" />
          <form className="admin-form-grid" onSubmit={generateInvite}>
            <label className="admin-field"><span>最多使用次数</span><input type="number" min="1" max="500" step="1" value={inviteUses} onChange={(event) => setInviteUses(event.target.value)} /></label>
            <label className="admin-field"><span>新用户赠送额度</span><input type="number" min="0" max="20" step="1" value={inviteGift} onChange={(event) => setInviteGift(event.target.value)} /></label>
            <div className="admin-form-note"><Info />邀请码不会承诺收益；佣金按后台当前规则结算。</div>
            <button className="admin-button admin-button--secondary admin-form-grid__submit" type="submit"><Key />生成邀请码</button>
          </form>
        </section>
      </div>

      {latestCodes.length ? (
        <section className="admin-code-output" aria-live="polite">
          <div><CheckCircle /><span><strong>最新一批凭证已生成</strong><small>完整卡密仅在此管理界面与本地状态中显示。</small></span></div>
          <code>{latestCodes.join("\n")}</code>
          <button className="admin-button admin-button--secondary" type="button" onClick={() => copyText(latestCodes.join("\n"), `已复制 ${latestCodes.length} 个凭证`)}><Copy />复制本批凭证</button>
        </section>
      ) : null}

      <section className="admin-panel">
        <SectionHeading
          title="充值码库存"
          description={`共 ${state.rechargeCodes.length} 个充值码，完整操作均写入审计记录。`}
          action={<label className="admin-select-field admin-select-field--compact"><span>状态</span><select value={codeFilter} onChange={(event) => setCodeFilter(event.target.value)}><option value="all">全部</option><option value="active">可用</option><option value="used">已使用</option><option value="disabled">已停用</option><option value="expired">已过期</option></select></label>}
        />
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>充值码</th><th>面值 / 次数</th><th>状态</th><th>有效期</th><th>使用者</th><th>创建时间</th><th><span className="sr-only">操作</span></th></tr></thead>
            <tbody>{displayedCodes.slice(0, 30).map((code) => {
              const usedBy = state.users.find((user) => user.id === code.usedBy);
              return <tr key={code.id}><td><code className="admin-inline-code">{code.code}</code></td><td>{formatMoney(code.value)} / {code.credits}</td><td><Badge tone={statusTone(code.status)}>{code.status === "active" ? "可用" : code.status === "used" ? "已使用" : code.status === "expired" ? "已过期" : "已停用"}</Badge></td><td>{code.expiresAt ? formatDate(code.expiresAt, false) : "永久"}</td><td>{usedBy?.nickname ?? "暂无"}</td><td>{formatDate(code.createdAt)}</td><td><button className="admin-icon-button" type="button" aria-label={`复制充值码 ${code.code}`} title="复制充值码" onClick={() => copyText(code.code, "充值码已复制")}><Copy /></button></td></tr>;
            })}</tbody>
          </table>
        </div>
        {!displayedCodes.length ? <EmptyState icon={<Ticket />} title="当前筛选没有充值码" copy="切换状态筛选或生成新凭证。" /> : null}
      </section>

      <section className="admin-panel">
        <SectionHeading title="邀请码台账" description="展示创建者、使用进度与赠送策略。" />
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>邀请码</th><th>创建者</th><th>使用进度</th><th>赠送额度</th><th>状态</th><th>创建时间</th></tr></thead><tbody>{state.inviteCodes.map((code) => { const creator = state.users.find((user) => user.id === code.createdBy); return <tr key={code.id}><td><code className="admin-inline-code">{code.code}</code></td><td>{creator?.nickname ?? code.createdBy}</td><td>{code.usedCount} / {code.maxUses}</td><td>{code.giftCredits} 次</td><td><Badge tone={statusTone(code.status)}>{code.status === "active" ? "可用" : code.status === "used" ? "已用尽" : code.status === "expired" ? "已过期" : "已停用"}</Badge></td><td>{formatDate(code.createdAt)}</td></tr>; })}</tbody></table></div>
      </section>
    </div>
  );
}

function PlatformsView() {
  const { state } = useAppStore();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="admin-view">
      <SectionHeading title="六平台模型星图" description="平台目录、用户凭据状态与生产适配器是三层独立事实。此版本不会伪报真实接口已接通。" />
      <div className="admin-adapter-warning">
        <CloudSlash />
        <div><strong>生产适配器未配置</strong><p>当前只有本地演示数据与掩码连接记录。要执行真实生成，后端还需实现各平台服务端适配器、密钥保险库、签名请求、回调验签和限流监控。</p></div>
        <Badge tone="warning">ADAPTER_NOT_CONFIGURED</Badge>
      </div>

      <div className="admin-platform-stack">
        {state.platforms.map((platform, index) => {
          const connections = state.platformConnections.filter((connection) => connection.platformId === platform.id);
          const taskCount = state.tasks.filter((task) => task.platformId === platform.id).length;
          const isOpen = expanded === platform.id;
          return (
            <section className={`admin-platform-row ${isOpen ? "is-open" : ""}`} key={platform.id}>
              <div className="admin-platform-row__index">{String(index + 1).padStart(2, "0")}</div>
              <div className="admin-platform-row__identity"><span className="admin-platform-mark admin-platform-mark--large"><i>{platform.shortName}</i></span><span><h3>{platform.name}</h3><p>{platform.description}</p></span></div>
              <div className="admin-platform-row__signals">
                <span><small>登记连接</small><strong>{connections.length}</strong></span>
                <span><small>历史任务</small><strong>{taskCount}</strong></span>
                <span><small>目录状态</small><Badge tone={platform.isEnabled ? "success" : "muted"}>{platform.isEnabled ? "已启用" : "已停用"}</Badge></span>
              </div>
              <div className="admin-platform-row__readiness"><CloudSlash /><span><strong>适配器未配置</strong><small>不能发起真实模型调用</small></span></div>
              <div className="admin-platform-row__actions">
                <button className="admin-icon-button" type="button" aria-expanded={isOpen} aria-controls={`platform-detail-${platform.id}`} title="查看接入清单" onClick={() => setExpanded(isOpen ? null : platform.id)}><CaretRight /></button>
                <button className="admin-button admin-button--disabled" type="button" disabled title="后端生产适配器与密钥保险库尚未配置，无法执行真实连通测试"><Pulse />真实连通测试</button>
              </div>
              {isOpen ? (
                <div className="admin-platform-row__detail" id={`platform-detail-${platform.id}`}>
                  <div><h4>接入边界</h4><ul><li>服务端适配器：未配置</li><li>接口基址登记：{platform.apiBaseUrl}</li><li>全局自有 API：{state.adminSettings.globalSelfApiEnabled ? "允许用户配置" : "已由管理员关闭"}</li><li>支持能力：{platform.supportedFeatures.length} 项目录声明</li></ul></div>
                  <div><h4>掩码凭据记录</h4>{connections.length ? <ul>{connections.map((connection) => { const owner = state.users.find((user) => user.id === connection.userId); return <li key={connection.id}>{owner?.nickname ?? connection.userId} · {connection.apiKeyHint || "未保留 Key"} · <Badge tone={statusTone(connection.status)}>{connection.statusMessage ?? connection.status}</Badge></li>; })}</ul> : <p className="admin-muted-copy">尚无用户连接记录。未存储、也不会展示任何明文密钥。</p>}</div>
                  <div><h4>上线前闸门</h4><ul><li>服务端密钥加密与轮换</li><li>真实请求超时、重试与熔断</li><li>调用成本、回调验签与审计</li></ul></div>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TasksView({ requestConfirmation, notify }: { requestConfirmation: (confirmation: PendingConfirmation) => void; notify: (outcome: Outcome) => void }) {
  const { state, retryTask, terminateTask } = useAppStore();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | TaskStatus>("all");
  const [selectedId, setSelectedId] = useState(state.tasks[0]?.id ?? "");
  const tasks = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return [...state.tasks]
      .filter((task) => (status === "all" || task.status === status) && (!keyword || [task.title, task.id, task.errorCode].filter(Boolean).some((value) => value!.toLowerCase().includes(keyword))))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }, [search, state.tasks, status]);
  const selected = tasks.find((task) => task.id === selectedId) ?? tasks[0];

  const retry = (task: GenerationTask) => {
    const result = retryTask(task.id);
    notify(result);
  };

  const terminate = (task: GenerationTask) => {
    requestConfirmation({
      title: "终止正在运行的生产任务？",
      description: `「${task.title}」将立即标记为管理员终止，队列位置释放且本次不扣额度。已经完成的上游片段不会自动恢复。`,
      confirmLabel: "确认终止任务",
      tone: "danger",
      action: () => terminateTask(task.id),
    });
  };

  return (
    <div className="admin-view">
      <SectionHeading title="全局任务轨道" description="跨用户、跨平台观察队列，处理失败重试与异常终止。" />
      <div className="admin-task-telemetry">
        {(["processing", "queued", "failed", "completed"] as TaskStatus[]).map((item) => <button key={item} type="button" className={status === item ? "is-active" : ""} onClick={() => setStatus(status === item ? "all" : item)}><span>{TASK_LABELS[item]}</span><strong>{state.tasks.filter((task) => task.status === item).length}</strong></button>)}
      </div>
      <div className="admin-toolbar">
        <label className="admin-search"><MagnifyingGlass /><span className="sr-only">搜索任务</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索任务标题、ID 或错误码" /></label>
        <label className="admin-select-field"><span>状态</span><select value={status} onChange={(event) => setStatus(event.target.value as "all" | TaskStatus)}><option value="all">全部状态</option>{Object.entries(TASK_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <span className="admin-toolbar__count">{tasks.length} 条任务</span>
      </div>

      <div className="admin-master-detail admin-master-detail--tasks">
        <section className="admin-panel admin-panel--flush">
          <div className="admin-table-wrap"><table className="admin-table admin-table--interactive"><thead><tr><th>任务</th><th>所有者 / 平台</th><th>状态</th><th>进度</th><th>额度</th><th>操作</th></tr></thead><tbody>{tasks.map((task) => {
            const owner = state.users.find((user) => user.id === task.userId);
            const platform = state.platforms.find((item) => item.id === task.platformId);
            const canTerminate = ["pending", "queued", "processing"].includes(task.status);
            const canRetry = task.status === "failed" && task.retryCount < task.maxRetries;
            return <tr key={task.id} className={selected?.id === task.id ? "is-selected" : ""}><td><button type="button" className="admin-primary-button-cell" onClick={() => setSelectedId(task.id)}><strong>{task.title}</strong><small>{task.id}</small></button></td><td><strong className="admin-secondary-cell">{owner?.nickname ?? "未知用户"}</strong><small>{platform?.name ?? "未知平台"}</small></td><td><Badge tone={statusTone(task.status)}>{TASK_LABELS[task.status]}</Badge></td><td><span className="admin-progress admin-progress--wide"><i style={{ width: `${task.progress}%` }} /></span><small>{task.progress}% · {task.stage}</small></td><td><strong className="admin-numeric">{task.creditsEstimated}</strong><small>{task.creditSource === "paid" ? "平台额度" : "自有 API"}</small></td><td><div className="admin-row-actions">{canRetry ? <button className="admin-icon-button" type="button" title="将失败任务重新加入队列" aria-label={`重试任务 ${task.title}`} onClick={() => retry(task)}><ArrowClockwise /></button> : null}{task.status === "failed" && !canRetry ? <button className="admin-icon-button" type="button" disabled title="已达到任务最大重试次数，需要先检查平台配置"><ArrowClockwise /></button> : null}{canTerminate ? <button className="admin-icon-button admin-icon-button--danger" type="button" title="终止异常任务" aria-label={`终止任务 ${task.title}`} onClick={() => terminate(task)}><StopCircle /></button> : <button className="admin-icon-button" type="button" disabled title="任务已进入终态，无需终止"><StopCircle /></button>}</div></td></tr>;
          })}</tbody></table></div>
          {!tasks.length ? <EmptyState icon={<ListChecks />} title="没有匹配任务" copy="切换状态或清空搜索词后再试。" /> : null}
        </section>
        <aside className="admin-inspector admin-task-inspector">
          {selected ? <><div className="admin-inspector__title"><span className="admin-inspector__glyph"><ListChecks /></span><div><h3>{selected.title}</h3><p>{selected.id}</p></div></div><div className="admin-task-stage"><span><i style={{ width: `${selected.progress}%` }} /></span><div><strong>{selected.progress}%</strong><small>{TASK_LABELS[selected.status]} · {selected.stage}</small></div></div><dl className="admin-detail-list"><div><dt>批量规模</dt><dd>{selected.input.batchCount} 集</dd></div><div><dt>画幅 / 清晰度</dt><dd>{selected.input.aspectRatio} · {selected.input.resolution}</dd></div><div><dt>重试次数</dt><dd>{selected.retryCount} / {selected.maxRetries}</dd></div><div><dt>扣费状态</dt><dd>{selected.creditsCharged ? `已扣 ${selected.creditsCharged}` : "尚未扣费"}</dd></div><div><dt>最近更新</dt><dd>{formatDate(selected.updatedAt)}</dd></div></dl>{selected.errorCode ? <div className="admin-error-detail"><span><Warning />失败详情</span><code>{selected.errorCode}</code><p>{selected.errorMessage ?? "本地模拟未提供失败详情，请先检查演示配置再重试。"}</p></div> : <div className="admin-info-detail"><CheckCircle /><p>{selected.status === "completed" ? "本地模拟任务已完成并结束演示扣额。" : "暂无失败信息，本地轨道状态正常。"}</p></div>}<details className="admin-disclosure"><summary>查看任务输入摘要</summary><p>{selected.input.prompt}</p><dl><div><dt>来源</dt><dd>{selected.input.sourceType}</dd></div><div><dt>时长</dt><dd>{selected.input.durationSeconds}s</dd></div><div><dt>语言</dt><dd>{selected.input.language}</dd></div></dl></details></> : <EmptyState icon={<ListChecks />} title="选择一个任务" copy="从左侧打开任务遥测详情。" />}
        </aside>
      </div>
    </div>
  );
}

function MaterialsView({ requestConfirmation, notify }: { requestConfirmation: (confirmation: PendingConfirmation) => void; notify: (outcome: Outcome) => void }) {
  const { state, recycleMaterial, restoreMaterial, purgeMaterial, purgeExpiredMaterials } = useAppStore();
  const [tab, setTab] = useState<"library" | "recycle">("library");
  const [search, setSearch] = useState("");
  const items = state.materials.filter((material) => material.isDeleted === (tab === "recycle") && (!search.trim() || material.title.toLowerCase().includes(search.trim().toLowerCase())));
  const expiredCount = state.materials.filter((material) => material.isDeleted && material.recycleExpiresAt && Date.parse(material.recycleExpiresAt) <= Date.now()).length;

  return (
    <div className="admin-view">
      <SectionHeading title="素材穹顶与回收策略" description="全局查看素材生命周期；回收站保留期由系统策略统一控制。" action={<div className="admin-retention-chip"><ArrowCounterClockwise />保留 {state.adminSettings.recycleRetentionDays} 天</div>} />
      <div className="admin-policy-strip"><ShieldCheck /><div><strong>安全删除策略</strong><p>移入回收站后仍可恢复；只有“永久清除”会不可逆移除本地记录。过期清理同样需要二次确认。</p></div><button className="admin-button admin-button--danger-ghost" type="button" disabled={!expiredCount} title={expiredCount ? "永久清除已超过保留期的素材" : "当前没有到期素材，无需清理"} onClick={() => requestConfirmation({ title: `永久清除 ${expiredCount} 个过期素材？`, description: "此操作不可撤回；素材记录和回收入口会从本地状态中移除。", confirmLabel: "永久清除过期素材", tone: "danger", action: () => purgeExpiredMaterials() })}><Trash />清理过期素材 ({expiredCount})</button></div>
      <div className="admin-toolbar"><div className="admin-segmented" role="tablist" aria-label="素材状态"><button role="tab" aria-selected={tab === "library"} className={tab === "library" ? "is-active" : ""} type="button" onClick={() => setTab("library")}>资料库 {state.materials.filter((item) => !item.isDeleted).length}</button><button role="tab" aria-selected={tab === "recycle"} className={tab === "recycle" ? "is-active" : ""} type="button" onClick={() => setTab("recycle")}>回收站 {state.materials.filter((item) => item.isDeleted).length}</button></div><label className="admin-search"><MagnifyingGlass /><span className="sr-only">搜索素材</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索素材名称" /></label></div>
      <section className="admin-panel admin-panel--flush"><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>素材</th><th>类型</th><th>所有者</th><th>大小 / 时长</th><th>{tab === "recycle" ? "自动清理" : "创建时间"}</th><th>操作</th></tr></thead><tbody>{items.map((material) => { const owner = state.users.find((user) => user.id === material.userId); return <tr key={material.id}><td><strong className="admin-primary-cell">{material.title}</strong><small>{material.description ?? material.id}</small></td><td><Badge tone="info">{MATERIAL_LABELS[material.type]}</Badge></td><td>{owner?.nickname ?? material.userId}</td><td>{material.durationSeconds ? `${material.durationSeconds}s` : formatBytes(material.sizeBytes)}</td><td>{tab === "recycle" ? formatDate(material.recycleExpiresAt) : formatDate(material.createdAt)}</td><td><div className="admin-row-actions">{material.isDeleted ? <><button className="admin-icon-button" type="button" title="恢复到资料库" aria-label={`恢复素材 ${material.title}`} onClick={() => notify(restoreMaterial(material.id))}><ArrowCounterClockwise /></button><button className="admin-icon-button admin-icon-button--danger" type="button" title="永久清除此素材" aria-label={`永久清除素材 ${material.title}`} onClick={() => requestConfirmation({ title: "永久清除此素材？", description: `「${material.title}」将从本地资料记录中不可逆移除。`, confirmLabel: "确认永久清除", tone: "danger", action: () => purgeMaterial(material.id) })}><Trash /></button></> : <button className="admin-icon-button admin-icon-button--danger" type="button" title="移入回收站" aria-label={`移入回收站 ${material.title}`} onClick={() => requestConfirmation({ title: "将素材移入回收站？", description: `「${material.title}」将在 ${state.adminSettings.recycleRetentionDays} 天内保留恢复入口。`, confirmLabel: "移入回收站", tone: "warning", action: () => recycleMaterial(material.id) })}><Trash /></button>}</div></td></tr>; })}</tbody></table></div>{!items.length ? <EmptyState icon={<Database />} title={tab === "recycle" ? "回收站为空" : "没有匹配素材"} copy={tab === "recycle" ? "删除的素材会在保留期内出现在这里。" : "清空搜索词或等待用户上传新素材。"} /> : null}</section>
    </div>
  );
}

function FinanceView({ requestConfirmation, notify }: { requestConfirmation: (confirmation: PendingConfirmation) => void; notify: (outcome: Outcome) => void }) {
  const { state, reviewWithdrawal } = useAppStore();
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const totalEarned = state.commissionAccounts.reduce((sum, item) => sum + item.totalEarned, 0);
  const available = state.commissionAccounts.reduce((sum, item) => sum + item.availableBalance, 0);
  const pending = state.withdrawalRequests.filter((item) => item.status === "pending");

  const review = (requestId: string, status: Exclude<WithdrawalStatus, "pending">) => {
    const request = state.withdrawalRequests.find((item) => item.id === requestId);
    if (!request) return;
    const remark = remarks[requestId]?.trim();
    if (status === "rejected" && !remark) {
      notify({ ok: false, message: "拒绝提现前必须填写可读原因，用户会收到该说明。" });
      return;
    }
    requestConfirmation({
      title: status === "approved" ? "确认已完成线下转账？" : "确认拒绝并退回佣金？",
      description: status === "approved"
        ? `系统不会代付。只有在你已向 ${request.accountMasked} 人工转账 ${formatMoney(request.actualAmount)} 后，才能将申请标记为通过。`
        : `申请金额 ${formatMoney(request.amount)} 将退回用户佣金余额，用户会收到原因：“${remark}”。`,
      confirmLabel: status === "approved" ? "已转账，确认通过" : "确认拒绝并退回",
      tone: status === "approved" ? "warning" : "danger",
      action: () => reviewWithdrawal(request.id, status, remark),
    });
  };

  return (
    <div className="admin-view">
      <SectionHeading title="分润结算与人工提现" description="两级邀请链、佣金流水和提现审核共享同一条可审计账本。" />
      <div className="admin-finance-ledger"><div className="admin-finance-ledger__hero"><HandCoins /><span><small>累计分润</small><strong>{formatMoney(totalEarned)}</strong><em>来自 {state.commissionTransactions.filter((item) => item.type === "level_1" || item.type === "level_2").length} 条分润流水</em></span></div><dl><div><dt>可用余额</dt><dd>{formatMoney(available)}</dd></div><div><dt>待审金额</dt><dd>{formatMoney(pending.reduce((sum, item) => sum + item.amount, 0))}</dd></div><div><dt>邀请关系</dt><dd>{state.inviteRelations.length}</dd></div><div><dt>兑换比例</dt><dd>¥1 : {state.adminSettings.commissionCreditsPerYuan} 次</dd></div></dl></div>
      <div className="admin-external-boundary"><LockKey /><div><strong>没有自动打款适配器</strong><p>“通过”只记录管理员已在线下完成转账，不会调用微信或支付宝付款接口。</p></div></div>
      <section className="admin-panel">
        <SectionHeading title="待审核提现" description="先核对实名与收款账户，再在线下转账，最后回到此处确认。" />
        {pending.length ? <div className="admin-withdraw-list">{pending.map((request) => { const user = state.users.find((item) => item.id === request.userId); return <article className="admin-withdraw-item" key={request.id}><div className="admin-withdraw-item__amount"><small>实际转账金额</small><strong>{formatMoney(request.actualAmount)}</strong><Badge tone="warning">待人工审核</Badge></div><dl><div><dt>申请用户</dt><dd>{user?.nickname ?? request.userId}</dd></div><div><dt>收款方式</dt><dd>{request.method === "wechat" ? "微信" : "支付宝"}</dd></div><div><dt>掩码账号</dt><dd>{request.accountMasked}</dd></div><div><dt>申请时间</dt><dd>{formatDate(request.createdAt)}</dd></div></dl><label className="admin-field"><span>审核备注 / 拒绝原因</span><input value={remarks[request.id] ?? ""} onChange={(event) => setRemarks((current) => ({ ...current, [request.id]: event.target.value }))} placeholder="通过时可选，拒绝时必填" /></label><div className="admin-withdraw-item__actions"><button className="admin-button admin-button--danger-ghost" type="button" onClick={() => review(request.id, "rejected")}><XCircle />拒绝并退回</button><button className="admin-button admin-button--primary" type="button" onClick={() => review(request.id, "approved")}><CheckCircle />已转账，复核通过</button></div></article>; })}</div> : <EmptyState icon={<CheckCircle />} title="没有待审提现" copy="新的提现申请会在此进入人工审核队列。" />}
      </section>
      <div className="admin-overview-columns">
        <section className="admin-panel admin-panel--wide"><SectionHeading title="分销关系链" description="仅展示两级以内的已绑定关系，不承诺固定收益。" /><div className="admin-relation-flow">{state.inviteRelations.map((relation) => { const user = state.users.find((item) => item.id === relation.userId); const inviter = state.users.find((item) => item.id === relation.invitedBy); return <div key={relation.id}><span>{inviter?.nickname ?? relation.invitedBy}</span><i><CaretRight /></i><span>{user?.nickname ?? relation.userId}</span><small>{formatDate(relation.createdAt, false)} 绑定</small></div>; })}</div></section>
        <section className="admin-panel"><SectionHeading title="最新佣金流水" description="金额正负方向按账户视角记录。" /><div className="admin-mini-ledger">{state.commissionTransactions.slice(0, 7).map((entry) => <div key={entry.id}><span><strong>{entry.description}</strong><small>{formatDate(entry.createdAt)}</small></span><b className={entry.amount >= 0 ? "is-positive" : "is-negative"}>{entry.amount >= 0 ? "+" : ""}{formatMoney(entry.amount)}</b></div>)}</div></section>
      </div>
    </div>
  );
}

function tutorialPayload(tutorial: Tutorial, patch: Partial<Tutorial> = {}) {
  return {
    id: tutorial.id,
    category: patch.category ?? tutorial.category,
    title: patch.title ?? tutorial.title,
    summary: patch.summary ?? tutorial.summary,
    content: patch.content ?? tutorial.content,
    videoUrl: patch.videoUrl ?? tutorial.videoUrl,
    durationMinutes: patch.durationMinutes ?? tutorial.durationMinutes,
    sortOrder: patch.sortOrder ?? tutorial.sortOrder,
    isPinned: patch.isPinned ?? tutorial.isPinned,
    isPublished: patch.isPublished ?? tutorial.isPublished,
    viewCount: patch.viewCount ?? tutorial.viewCount,
  };
}

function announcementPayload(announcement: Announcement, patch: Partial<Announcement> = {}) {
  return {
    id: announcement.id,
    type: patch.type ?? announcement.type,
    title: patch.title ?? announcement.title,
    eyebrow: patch.eyebrow ?? announcement.eyebrow,
    imageUrl: patch.imageUrl ?? announcement.imageUrl,
    content: patch.content ?? announcement.content,
    jumpUrl: patch.jumpUrl ?? announcement.jumpUrl,
    jumpType: patch.jumpType ?? announcement.jumpType,
    sortOrder: patch.sortOrder ?? announcement.sortOrder,
    isActive: patch.isActive ?? announcement.isActive,
    startsAt: patch.startsAt ?? announcement.startsAt,
    endsAt: patch.endsAt ?? announcement.endsAt,
  };
}

function ContentView({ notify }: { notify: (outcome: Outcome) => void }) {
  const { state, saveTutorial, saveAnnouncement, updateFeedbackByAdmin } = useAppStore();
  const [tab, setTab] = useState<"tutorials" | "announcements" | "notifications" | "feedback">("tutorials");
  const [tutorialDraft, setTutorialDraft] = useState({ title: "", summary: "", content: "", category: "getting_started" as TutorialCategory, duration: "5" });
  const [announcementDraft, setAnnouncementDraft] = useState({ title: "", content: "", type: "notice" as AnnouncementType });
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, { status: FeedbackStatus; reply: string }>>({});

  const addTutorial = (event: FormEvent) => {
    event.preventDefault();
    if (tutorialDraft.title.trim().length < 2 || tutorialDraft.summary.trim().length < 4 || tutorialDraft.content.trim().length < 8) {
      notify({ ok: false, message: "请完整填写教程标题、摘要与正文。" });
      return;
    }
    const result = saveTutorial({ category: tutorialDraft.category, title: tutorialDraft.title.trim(), summary: tutorialDraft.summary.trim(), content: tutorialDraft.content.trim(), durationMinutes: Math.max(1, Number(tutorialDraft.duration) || 1), sortOrder: state.tutorials.length + 1, isPinned: false, isPublished: false, viewCount: 0 });
    notify(result);
    if (result.ok) setTutorialDraft({ title: "", summary: "", content: "", category: "getting_started", duration: "5" });
  };

  const addAnnouncement = (event: FormEvent) => {
    event.preventDefault();
    if (announcementDraft.title.trim().length < 2 || announcementDraft.content.trim().length < 5) {
      notify({ ok: false, message: "请完整填写公告标题与正文。" });
      return;
    }
    const startsAt = new Date().toISOString();
    const endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = saveAnnouncement({ type: announcementDraft.type, title: announcementDraft.title.trim(), content: announcementDraft.content.trim(), sortOrder: state.announcements.length + 1, isActive: false, startsAt, endsAt });
    notify(result);
    if (result.ok) setAnnouncementDraft({ title: "", content: "", type: "notice" });
  };

  const saveFeedback = (feedbackId: string) => {
    const original = state.feedbacks.find((item) => item.id === feedbackId);
    if (!original) return;
    const draft = feedbackDrafts[feedbackId] ?? { status: original.status, reply: original.adminReply ?? "" };
    notify(updateFeedbackByAdmin(feedbackId, draft.status, draft.reply));
  };

  return (
    <div className="admin-view">
      <SectionHeading title="内容与服务中继" description="维护教程、公告与用户反馈；通知广播需等待服务端发送适配器。" />
      <div className="admin-content-tabs" role="tablist" aria-label="内容运营模块">{([{ id: "tutorials", label: "使用教程", icon: <BookOpenText /> }, { id: "announcements", label: "公告管理", icon: <PaperPlaneTilt /> }, { id: "notifications", label: "通知观察", icon: <Bell /> }, { id: "feedback", label: "反馈闭环", icon: <ClipboardText /> }] as const).map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "is-active" : ""} onClick={() => setTab(item.id)}>{item.icon}<span>{item.label}</span><strong>{item.id === "tutorials" ? state.tutorials.length : item.id === "announcements" ? state.announcements.length : item.id === "notifications" ? state.notifications.length : state.feedbacks.length}</strong></button>)}</div>

      {tab === "tutorials" ? <div className="admin-split-layout admin-split-layout--content"><section className="admin-panel"><SectionHeading title="教程目录" description="发布状态与置顶顺序即时写入本地内容模型。" /><div className="admin-content-list">{[...state.tutorials].sort((a, b) => a.sortOrder - b.sortOrder).map((tutorial) => <article key={tutorial.id}><div className="admin-content-list__meta"><Badge tone={tutorial.isPublished ? "success" : "muted"}>{tutorial.isPublished ? "已发布" : "草稿"}</Badge><span>{TUTORIAL_CATEGORY_LABELS[tutorial.category]} · {tutorial.durationMinutes} 分钟</span></div><h3>{tutorial.title}</h3><p>{tutorial.summary}</p><div className="admin-content-list__footer"><small>{tutorial.viewCount.toLocaleString("zh-CN")} 次查看 · 更新 {formatDate(tutorial.updatedAt)}</small><button className="admin-button admin-button--small" type="button" onClick={() => notify(saveTutorial(tutorialPayload(tutorial, { isPublished: !tutorial.isPublished })))}>{tutorial.isPublished ? "转为草稿" : "发布教程"}</button></div></article>)}</div></section><aside className="admin-panel"><SectionHeading title="新建教程草稿" description="先保存为草稿，确认内容后再发布。" /><form className="admin-stacked-form" onSubmit={addTutorial}><label className="admin-field"><span>分类</span><select value={tutorialDraft.category} onChange={(event) => setTutorialDraft((current) => ({ ...current, category: event.target.value as TutorialCategory }))}>{Object.entries(TUTORIAL_CATEGORY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="admin-field"><span>教程标题</span><input value={tutorialDraft.title} onChange={(event) => setTutorialDraft((current) => ({ ...current, title: event.target.value }))} placeholder="清晰描述学习结果" /></label><label className="admin-field"><span>摘要</span><textarea rows={3} value={tutorialDraft.summary} onChange={(event) => setTutorialDraft((current) => ({ ...current, summary: event.target.value }))} placeholder="用户将在几分钟内学会什么" /></label><label className="admin-field"><span>正文</span><textarea rows={7} value={tutorialDraft.content} onChange={(event) => setTutorialDraft((current) => ({ ...current, content: event.target.value }))} placeholder="支持 Markdown 纯文本内容" /></label><label className="admin-field"><span>预计时长（分钟）</span><input type="number" min="1" value={tutorialDraft.duration} onChange={(event) => setTutorialDraft((current) => ({ ...current, duration: event.target.value }))} /></label><button className="admin-button admin-button--primary" type="submit"><Plus />保存教程草稿</button></form></aside></div> : null}

      {tab === "announcements" ? <div className="admin-split-layout admin-split-layout--content"><section className="admin-panel"><SectionHeading title="公告编排" description="活动窗口到期后会自动停止展示。" /><div className="admin-content-list">{[...state.announcements].sort((a, b) => a.sortOrder - b.sortOrder).map((announcement) => <article key={announcement.id}><div className="admin-content-list__meta"><Badge tone={announcement.isActive ? "success" : "muted"}>{announcement.isActive ? "展示中" : "已停用"}</Badge><span>{announcement.type.toUpperCase()} · 至 {formatDate(announcement.endsAt, false)}</span></div><h3>{announcement.title}</h3><p>{announcement.content}</p><div className="admin-content-list__footer"><small>排序 {announcement.sortOrder} · 更新 {formatDate(announcement.updatedAt)}</small><button className="admin-button admin-button--small" type="button" onClick={() => notify(saveAnnouncement(announcementPayload(announcement, { isActive: !announcement.isActive })))}>{announcement.isActive ? "停止展示" : "启用公告"}</button></div></article>)}</div></section><aside className="admin-panel"><SectionHeading title="新建公告草稿" description="默认保存为停用状态，有效窗口为 30 天。" /><form className="admin-stacked-form" onSubmit={addAnnouncement}><label className="admin-field"><span>公告类型</span><select value={announcementDraft.type} onChange={(event) => setAnnouncementDraft((current) => ({ ...current, type: event.target.value as AnnouncementType }))}><option value="notice">站内通知</option><option value="banner">横幅</option><option value="popup">弹窗</option></select></label><label className="admin-field"><span>标题</span><input value={announcementDraft.title} onChange={(event) => setAnnouncementDraft((current) => ({ ...current, title: event.target.value }))} placeholder="公告标题" /></label><label className="admin-field"><span>正文</span><textarea rows={7} value={announcementDraft.content} onChange={(event) => setAnnouncementDraft((current) => ({ ...current, content: event.target.value }))} placeholder="说明变化、影响与用户下一步" /></label><button className="admin-button admin-button--primary" type="submit"><Plus />保存公告草稿</button></form></aside></div> : null}

      {tab === "notifications" ? <section className="admin-panel"><SectionHeading title="全局通知观察" description="可检查现有通知投递结果；当前 store 未提供管理员广播写入接口。" action={<button className="admin-button admin-button--disabled" type="button" disabled title="通知广播服务端适配器尚未实现，避免展示虚假发送成功"><PaperPlaneTilt />发送全站通知</button>} /><div className="admin-adapter-note"><CloudSlash /><span><strong>广播适配器未配置</strong><small>按钮保持原因禁用，直到具备服务端队列、受众选择、退订与送达审计。</small></span></div><div className="admin-notification-stream">{state.notifications.map((notification) => { const user = state.users.find((item) => item.id === notification.userId); return <article key={notification.id}><span className={`admin-notification-stream__signal is-${notification.priority}`}><Bell /></span><div><span><strong>{notification.title}</strong><Badge tone={notification.isRead ? "muted" : "info"}>{notification.isRead ? "已读" : "未读"}</Badge></span><p>{notification.content}</p><small>发送给 {user?.nickname ?? notification.userId} · {formatDate(notification.createdAt)}</small></div></article>; })}</div></section> : null}

      {tab === "feedback" ? <section className="admin-panel"><SectionHeading title="用户反馈闭环" description="回复内容对用户可见；状态与回复时间会被审计。" /><div className="admin-feedback-list">{state.feedbacks.map((feedback) => { const user = state.users.find((item) => item.id === feedback.userId); const draft = feedbackDrafts[feedback.id] ?? { status: feedback.status, reply: feedback.adminReply ?? "" }; return <article key={feedback.id}><header><div><Badge tone={statusTone(feedback.status)}>{FEEDBACK_STATUS_LABELS[feedback.status]}</Badge><span>{feedback.type} · {user?.nickname ?? feedback.userId}</span></div><small>{formatDate(feedback.createdAt)}</small></header><h3>{feedback.title}</h3><p>{feedback.content}</p><div className="admin-feedback-editor"><label className="admin-field"><span>处理状态</span><select value={draft.status} onChange={(event) => setFeedbackDrafts((current) => ({ ...current, [feedback.id]: { ...draft, status: event.target.value as FeedbackStatus } }))}>{Object.entries(FEEDBACK_STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="admin-field"><span>管理员回复</span><textarea rows={3} value={draft.reply} onChange={(event) => setFeedbackDrafts((current) => ({ ...current, [feedback.id]: { ...draft, reply: event.target.value } }))} placeholder="说明处理结论与下一步" /></label><button className="admin-button admin-button--secondary" type="button" onClick={() => saveFeedback(feedback.id)}><FloppyDisk />保存处理结果</button></div></article>; })}</div></section> : null}
    </div>
  );
}

function AuditView({ notify }: { notify: (outcome: Outcome) => void }) {
  const { state } = useAppStore();
  const [search, setSearch] = useState("");
  const [module, setModule] = useState<"all" | AuditModule>("all");
  const logs = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return [...state.auditLogs].filter((log) => (module === "all" || log.module === module) && (!keyword || [log.action, log.targetId, log.actorUserId, log.ipAddress].filter(Boolean).some((value) => value!.toLowerCase().includes(keyword)))).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [module, search, state.auditLogs]);

  const exportLogs = () => {
    try {
      const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json;charset=utf-8" });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `arcane-audit-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(href);
      notify({ ok: true, message: `已导出 ${logs.length} 条审计记录。` });
    } catch {
      notify({ ok: false, message: "浏览器阻止了本地文件导出，请检查下载权限。" });
    }
  };

  return (
    <div className="admin-view">
      <SectionHeading title="不可变操作回廊" description="追溯身份、风险、任务、结算和全局配置变更。演示版日志保存在浏览器本地。" action={<button className="admin-button admin-button--secondary" type="button" onClick={exportLogs}><ClipboardText />导出当前结果</button>} />
      <div className="admin-toolbar"><label className="admin-search"><MagnifyingGlass /><span className="sr-only">搜索审计日志</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索动作、对象、操作者或 IP" /></label><label className="admin-select-field"><span>模块</span><select value={module} onChange={(event) => setModule(event.target.value as "all" | AuditModule)}><option value="all">全部模块</option>{Object.entries(MODULE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><span className="admin-toolbar__count">{logs.length} 条记录</span></div>
      <section className="admin-panel admin-panel--flush"><div className="admin-audit-timeline">{logs.map((log) => { const actor = state.users.find((user) => user.id === log.actorUserId); return <article key={log.id}><span className="admin-audit-timeline__node"><ShieldCheck /></span><div className="admin-audit-timeline__body"><header><span><Badge tone={log.module === "risk" || log.module === "withdrawal" ? "warning" : "info"}>{MODULE_LABELS[log.module]}</Badge><strong>{log.action}</strong></span><time>{formatDate(log.createdAt)}</time></header><p>{actor?.nickname ?? log.actorUserId} · {ROLE_LABELS[log.actorRole]} · {log.ipAddress}</p><div className="admin-audit-timeline__target"><span>目标</span><code>{log.targetType ?? "system"}{log.targetId ? ` / ${log.targetId}` : ""}</code></div>{log.before || log.after ? <details className="admin-disclosure"><summary>查看变更差异</summary><div className="admin-json-diff"><div><span>变更前</span><pre>{JSON.stringify(log.before ?? {}, null, 2)}</pre></div><CaretRight /><div><span>变更后</span><pre>{JSON.stringify(log.after ?? {}, null, 2)}</pre></div></div></details> : null}</div></article>; })}</div>{!logs.length ? <EmptyState icon={<ShieldCheck />} title="没有匹配日志" copy="调整筛选条件查看其他审计事件。" /> : null}</section>
    </div>
  );
}

function SettingsView({ requestConfirmation, notify }: { requestConfirmation: (confirmation: PendingConfirmation) => void; notify: (outcome: Outcome) => void }) {
  const { state, updateAdminSettings } = useAppStore();
  const [draft, setDraft] = useState<AdminSettings>({ ...state.adminSettings });

  useEffect(() => setDraft({ ...state.adminSettings }), [state.adminSettings]);

  const update = <K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    const concurrency = Number(draft.maxConcurrentTasks);
    const retry = Number(draft.autoRetryLimit);
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 50) {
      notify({ ok: false, message: "系统并发必须为 1–50 的整数。" });
      return;
    }
    if (!Number.isInteger(retry) || retry < 0 || retry > 3) {
      notify({ ok: false, message: "自动重试次数必须为 0–3 的整数。" });
      return;
    }
    requestConfirmation({
      title: "写入全局运行策略？",
      description: "这些设置会影响所有用户的新任务、素材保留和佣金操作。正在执行的任务不会被强制改写。",
      confirmLabel: "确认保存全局策略",
      tone: "warning",
      action: () => updateAdminSettings({
        globalSelfApiEnabled: draft.globalSelfApiEnabled,
        maxConcurrentTasks: concurrency,
        autoRetryLimit: retry,
        recycleRetentionDays: draft.recycleRetentionDays,
        compliancePopupEnabled: draft.compliancePopupEnabled,
        commissionExchangeEnabled: draft.commissionExchangeEnabled,
        withdrawalsEnabled: draft.withdrawalsEnabled,
        firstLevelCommissionRate: Number(draft.firstLevelCommissionRate),
        secondLevelCommissionRate: Number(draft.secondLevelCommissionRate),
        commissionCreditsPerYuan: Number(draft.commissionCreditsPerYuan),
        lowCreditWarningThreshold: Number(draft.lowCreditWarningThreshold),
        popupNotificationText: draft.popupNotificationText.trim(),
      }),
    });
  };

  return (
    <div className="admin-view">
      <SectionHeading title="系统核心策略" description="修改会写入审计日志；所有高影响设置统一在保存时二次确认。" />
      <form className="admin-settings-layout" onSubmit={save}>
        <section className="admin-settings-core">
          <header><span className="admin-settings-core__sigil"><GearSix /></span><div><h3>生产运行策略</h3><p>限制并发、失败重试与素材生命周期。</p></div></header>
          <div className="admin-settings-core__numbers">
            <label className="admin-field"><span>全局最大并发任务</span><input type="number" min="1" max="50" step="1" value={draft.maxConcurrentTasks} onChange={(event) => update("maxConcurrentTasks", Number(event.target.value))} /><small>允许范围 1–50；只影响新进入队列的任务。</small></label>
            <label className="admin-field"><span>失败自动重试次数</span><select value={draft.autoRetryLimit} onChange={(event) => update("autoRetryLimit", Number(event.target.value))}>{[0, 1, 2, 3].map((value) => <option value={value} key={value}>{value} 次</option>)}</select><small>上限固定为 3，避免循环消耗资源。</small></label>
            <fieldset className="admin-radio-field"><legend>回收站保留周期</legend><div>{([7, 15, 30] as const).map((days) => <label key={days}><input type="radio" name="retention" value={days} checked={draft.recycleRetentionDays === days} onChange={() => update("recycleRetentionDays", days)} /><span>{days} 天</span></label>)}</div><small>修改后，新移入回收站的素材采用新周期。</small></fieldset>
          </div>
          <div className="admin-settings-core__switches">
            <SwitchField label="允许用户使用自有 API" description="仅开放配置入口；真实调用仍要求服务端平台适配器。" checked={draft.globalSelfApiEnabled} onChange={(value) => update("globalSelfApiEnabled", value)} />
            <SwitchField label="合规确认弹窗" description="解析视频与声音克隆前要求用户确认素材授权。" checked={draft.compliancePopupEnabled} onChange={(value) => update("compliancePopupEnabled", value)} />
            <SwitchField label="开放佣金兑换额度" description="代理可把可用佣金按比例转换为平台额度。" checked={draft.commissionExchangeEnabled} onChange={(value) => update("commissionExchangeEnabled", value)} />
            <SwitchField label="开放提现申请" description="只开放申请入口；实际转账仍由管理员线下完成。" checked={draft.withdrawalsEnabled} onChange={(value) => update("withdrawalsEnabled", value)} />
          </div>
        </section>

        <aside className="admin-settings-side">
          <section className="admin-panel"><SectionHeading title="分润与预警" description="百分比使用小数表达，例如 0.10 = 10%。" /><div className="admin-stacked-form"><label className="admin-field"><span>一级佣金比例</span><input type="number" min="0" max="1" step="0.01" value={draft.firstLevelCommissionRate} onChange={(event) => update("firstLevelCommissionRate", Number(event.target.value))} /></label><label className="admin-field"><span>二级佣金比例</span><input type="number" min="0" max="1" step="0.01" value={draft.secondLevelCommissionRate} onChange={(event) => update("secondLevelCommissionRate", Number(event.target.value))} /></label><label className="admin-field"><span>每元兑换额度</span><input type="number" min="0" step="1" value={draft.commissionCreditsPerYuan} onChange={(event) => update("commissionCreditsPerYuan", Number(event.target.value))} /></label><label className="admin-field"><span>低额度预警阈值</span><input type="number" min="0" step="1" value={draft.lowCreditWarningThreshold} onChange={(event) => update("lowCreditWarningThreshold", Number(event.target.value))} /></label></div></section>
          <section className="admin-panel"><SectionHeading title="任务完成通知文案" description="用于本地弹窗；真实推送服务尚未接入。" /><label className="admin-field"><span>通知正文</span><textarea rows={4} value={draft.popupNotificationText} onChange={(event) => update("popupNotificationText", event.target.value)} maxLength={160} /><small>{draft.popupNotificationText.length} / 160</small></label></section>
          <div className="admin-adapter-note"><CloudSlash /><span><strong>外部支付与推送适配器未配置</strong><small>策略开关只控制产品入口，不代表付款、短信或推送服务已经上线。</small></span></div>
          <button className="admin-button admin-button--primary admin-settings-save" type="submit"><FloppyDisk />复核并保存全局策略</button>
          <small className="admin-settings-updated">上次更新 {formatDate(state.adminSettings.updatedAt)} · {state.adminSettings.updatedBy}</small>
        </aside>
      </form>
    </div>
  );
}

export function AdminWorkspace({ view, onNavigate }: AdminWorkspaceProps) {
  const { currentUser } = useAppStore();
  const activeView = normalizeView(view);
  const currentNav = NAV_ITEMS.find((item) => item.id === activeView) ?? NAV_ITEMS[0];
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const notify = (outcome: Outcome) => {
    setNotice({ tone: outcome.ok ? "success" : "error", message: outcome.message });
  };

  const runConfirmedAction = () => {
    if (!pending) return;
    const outcome = pending.action();
    setPending(null);
    notify(outcome);
  };

  if (!currentUser || currentUser.role !== "admin") {
    return (
      <section className="admin-workspace admin-workspace--denied" aria-labelledby="admin-access-title">
        <section className="admin-access-denied"><span><LockKey /></span><h1 id="admin-access-title">管理权限未验证</h1><p>当前身份不能访问全局用户、结算与系统策略。请使用管理员身份重新登录。</p><button className="admin-button admin-button--primary" type="button" onClick={() => onNavigate("dashboard")}>返回个人工作台</button></section>
      </section>
    );
  }

  return (
    <section className="admin-workspace" aria-label="星核管理工作区">
      <div className="admin-workspace__constellation" aria-hidden="true"><i /><i /><i /></div>
      <header className="admin-topbar">
        <div className="admin-topbar__identity">
          <div className="admin-topbar__sigil"><ShieldCheck weight="duotone" /></div>
          <div><span>ARCANE CONTROL / V7.1</span><h1>{currentNav.label}</h1><p>{currentNav.description} · 超级管理员 {currentUser.nickname}</p></div>
        </div>
        <div className="admin-topbar__status"><span><i />本地状态已同步</span><Badge tone="warning">生产适配器未配置</Badge></div>
      </header>

      <nav className="admin-command-nav" aria-label="管理后台模块">
        {NAV_ITEMS.map((item) => (
          <button key={item.id} type="button" className={activeView === item.id ? "is-active" : ""} aria-current={activeView === item.id ? "page" : undefined} onClick={() => onNavigate(`admin-${item.id}`)}>
            <span>{item.icon}</span><span><strong>{item.label}</strong><small>{item.description}</small></span>
          </button>
        ))}
      </nav>

      <div className="admin-workspace__viewport">
        {activeView === "overview" ? <OverviewView onNavigate={onNavigate} /> : null}
        {activeView === "users" ? <UsersView requestConfirmation={setPending} notify={notify} /> : null}
        {activeView === "codes" ? <CodesView notify={notify} /> : null}
        {activeView === "platforms" ? <PlatformsView /> : null}
        {activeView === "tasks" ? <TasksView requestConfirmation={setPending} notify={notify} /> : null}
        {activeView === "materials" ? <MaterialsView requestConfirmation={setPending} notify={notify} /> : null}
        {activeView === "finance" ? <FinanceView requestConfirmation={setPending} notify={notify} /> : null}
        {activeView === "content" ? <ContentView notify={notify} /> : null}
        {activeView === "audit" ? <AuditView notify={notify} /> : null}
        {activeView === "settings" ? <SettingsView requestConfirmation={setPending} notify={notify} /> : null}
      </div>

      {notice ? <div className={`admin-toast admin-toast--${notice.tone}`} role="status" aria-live="polite">{notice.tone === "success" ? <CheckCircle /> : <Warning />}<span>{notice.message}</span><button type="button" aria-label="关闭提示" onClick={() => setNotice(null)}><XCircle /></button></div> : null}
      <ConfirmDialog pending={pending} onCancel={() => setPending(null)} onConfirm={runConfirmedAction} />
    </section>
  );
}

export default AdminWorkspace;
