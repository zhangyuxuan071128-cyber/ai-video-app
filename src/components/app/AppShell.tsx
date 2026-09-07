import {
  Article,
  Bank,
  Bell,
  CaretRight,
  Coins,
  Cpu,
  FolderOpen,
  Gear,
  House,
  ImageSquare,
  Lifebuoy,
  List,
  ListChecks,
  PlugsConnected,
  Scroll,
  ShieldCheck,
  SidebarSimple,
  SignOut,
  Sparkle,
  Stack,
  Ticket,
  TreeStructure,
  UserCircle,
  UsersThree,
  Wallet,
  X,
  type IconProps,
} from "@phosphor-icons/react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { StarbladePointer } from "./StarbladePointer";
import "../../styles/system.css";
import "../../styles/shell.css";

export type AppRole = "user" | "agent" | "admin";

export interface AppShellProps {
  role: AppRole;
  userName: string;
  credits: number;
  creditWarningThreshold?: number;
  unreadCount: number;
  runtimeStatus?: "connected" | "offline" | "error" | "idle";
  runtimeMessage?: string;
  activeView: string;
  onNavigate: (id: string) => void;
  onLogout: () => void;
  children: ReactNode;
}

interface NavItem {
  id: string;
  label: string;
  description: string;
  icon: ComponentType<IconProps>;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const creatorNavigation: NavGroup[] = [
  {
    label: "生产中枢",
    items: [
      { id: "dashboard", label: "创作总览", description: "生产进度与核心指标", icon: House },
      { id: "create", label: "星核创作", description: "创建批量视频任务", icon: Sparkle },
      { id: "tasks", label: "任务星轨", description: "队列、进度与结果", icon: Stack },
      { id: "materials", label: "素材矩阵", description: "角色、商品与成片资产", icon: ImageSquare },
    ],
  },
  {
    label: "连接与资产",
    items: [
      { id: "platforms", label: "模型平台", description: "连接生成服务与 API", icon: PlugsConnected },
      { id: "wallet", label: "能量钱包", description: "额度、充值与用量", icon: Wallet },
      { id: "growth", label: "成长中心", description: "邀请、团队与佣金", icon: TreeStructure },
    ],
  },
  {
    label: "个人空间",
    items: [
      { id: "notifications", label: "消息中心", description: "任务与系统通知", icon: Bell },
      { id: "support", label: "教程支持", description: "指南、反馈与帮助", icon: Lifebuoy },
      { id: "settings", label: "账户设置", description: "身份、安全与偏好", icon: Gear },
    ],
  },
];

const adminNavigation: NavGroup[] = [
  {
    label: "全域态势",
    items: [
      { id: "admin-overview", label: "管理总览", description: "平台经营与系统态势", icon: ShieldCheck },
      { id: "admin-users", label: "用户治理", description: "账户、权限与状态", icon: UsersThree },
      { id: "admin-codes", label: "码库管理", description: "充值码与邀请码", icon: Ticket },
    ],
  },
  {
    label: "生产治理",
    items: [
      { id: "admin-platforms", label: "平台配置", description: "模型平台与功能开关", icon: Cpu },
      { id: "admin-tasks", label: "任务监管", description: "全站任务与异常处理", icon: ListChecks },
      { id: "admin-materials", label: "素材管理", description: "全站资产与回收站", icon: FolderOpen },
    ],
  },
  {
    label: "运营控制",
    items: [
      { id: "admin-finance", label: "财务与佣金", description: "流水、提现与结算", icon: Bank },
      { id: "admin-content", label: "内容运营", description: "公告、教程与反馈", icon: Article },
      { id: "admin-audit", label: "安全审计", description: "操作日志与风控记录", icon: Scroll },
      { id: "admin-settings", label: "系统设置", description: "全局规则与系统参数", icon: Gear },
    ],
  },
];

const roleLabel: Record<AppRole, string> = {
  user: "创作者空间",
  agent: "代理协作台",
  admin: "星核管理域",
};

function AppAmbient() {
  return (
    <div className="sx-shell__ambient" aria-hidden="true">
      <div className="sx-shell__starfield" />
      <svg className="sx-shell__portal" viewBox="0 0 720 720" fill="none">
        <circle className="sx-shell__orbit sx-shell__orbit--one" cx="360" cy="360" r="292" />
        <circle className="sx-shell__orbit sx-shell__orbit--two" cx="360" cy="360" r="244" />
        <circle className="sx-shell__orbit sx-shell__orbit--three" cx="360" cy="360" r="194" />
        <path className="sx-shell__glyph" d="M360 54 382 91 360 128 338 91 360 54ZM666 360 629 382 592 360 629 338 666 360ZM360 666 338 629 360 592 382 629 360 666ZM54 360 91 338 128 360 91 382 54 360Z" />
        <path className="sx-shell__axis" d="M360 92V628M92 360H628" />
        <path className="sx-shell__constellation" d="m156 217 55 13 39-44 67 19 43-52 52 67 75-14 32 53 55 26M148 502l70-27 46 36 69-20 58 40 48-62 73 16 48-38" />
        <circle className="sx-shell__core" cx="360" cy="360" r="92" />
        <path className="sx-shell__core-mark" d="m360 280 19 52 52 28-52 28-19 52-19-52-52-28 52-28 19-52Z" />
      </svg>
    </div>
  );
}

export function AppShell({
  role,
  userName,
  credits,
  creditWarningThreshold = 0,
  unreadCount,
  runtimeStatus = "offline",
  runtimeMessage,
  activeView,
  onNavigate,
  onLogout,
  children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileViewport, setMobileViewport] = useState(
    () => typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 860px)").matches
      : false,
  );
  const sidebarRef = useRef<HTMLElement>(null);
  const navigation = role === "admin" ? adminNavigation : creatorNavigation;
  const homeView = role === "admin" ? "admin-overview" : "dashboard";
  const settingsView = role === "admin" ? "admin-settings" : "settings";
  const notificationView = role === "admin" ? "admin-content" : "notifications";
  const allItems = useMemo(() => navigation.flatMap((group) => group.items), [navigation]);
  const current = allItems.find((item) => item.id === activeView);
  const initials = userName.trim().slice(0, 1).toUpperCase() || "星";
  const safeCredits = Number.isFinite(credits) ? Math.max(0, credits) : 0;
  const lowCredits = creditWarningThreshold > 0 && safeCredits <= creditWarningThreshold;
  const safeUnreadCount = Number.isFinite(unreadCount) ? Math.max(0, Math.floor(unreadCount)) : 0;

  useEffect(() => {
    setMobileOpen(false);
  }, [activeView]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mobileQuery = window.matchMedia("(max-width: 860px)");
    const handleBreakpointChange = (event: MediaQueryListEvent) => {
      setMobileViewport(event.matches);
      if (!event.matches) setMobileOpen(false);
    };
    setMobileViewport(mobileQuery.matches);
    mobileQuery.addEventListener("change", handleBreakpointChange);
    return () => mobileQuery.removeEventListener("change", handleBreakpointChange);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const sidebar = sidebarRef.current;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";

    const focusableSelector = [
      "button:not([disabled])",
      "a[href]",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");
    const frame = window.requestAnimationFrame(() => {
      sidebar?.querySelector<HTMLElement>(".sx-sidebar__close-mobile")?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab" || !sidebar) return;
      const focusable = Array.from(sidebar.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => element.getClientRects().length > 0,
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [mobileOpen]);

  const navigate = (id: string) => {
    onNavigate(id);
    setMobileOpen(false);
  };

  return (
    <div
      className="sx-shell"
      data-sidebar={collapsed ? "collapsed" : "expanded"}
      data-mobile-nav={mobileOpen ? "open" : "closed"}
    >
      <a className="sx-shell__skip" href="#sx-main-content">跳到主要内容</a>
      <AppAmbient />
      <StarbladePointer />

      <button
        className="sx-shell__scrim"
        type="button"
        aria-label="关闭导航菜单"
        aria-hidden={!mobileOpen}
        tabIndex={mobileOpen ? 0 : -1}
        onClick={() => setMobileOpen(false)}
      />

      <aside
        ref={sidebarRef}
        className="sx-sidebar"
        aria-label={mobileOpen ? "移动主导航" : "主导航"}
        aria-hidden={mobileViewport && !mobileOpen ? true : undefined}
        aria-modal={mobileOpen || undefined}
        inert={mobileViewport && !mobileOpen ? true : undefined}
        role={mobileOpen ? "dialog" : undefined}
      >
        <div className="sx-sidebar__brand-row">
          <button
            className="sx-brand"
            type="button"
            aria-label="返回星核影枢首页"
            title="星核影枢"
            onClick={() => navigate(homeView)}
          >
            <span className="sx-brand__mark" aria-hidden="true">
              <span className="sx-brand__diamond" />
              <span className="sx-brand__core" />
            </span>
            <span className="sx-brand__copy">
              <strong>星核影枢</strong>
              <small>STELLAR VIDEO OS</small>
            </span>
          </button>

          <button
            className="sx-sidebar__close-mobile"
            type="button"
            aria-label="关闭导航菜单"
            onClick={() => setMobileOpen(false)}
          >
            <X size={19} weight="bold" />
          </button>
        </div>

        <div className="sx-sidebar__role">
          <span className="sx-sidebar__role-dot" aria-hidden="true" />
          <span>{roleLabel[role]}</span>
        </div>

        <nav className="sx-sidebar__nav">
          {navigation.map((group) => (
            <section className="sx-nav-group" key={group.label} aria-labelledby={`nav-${group.label}`}>
              <h2 id={`nav-${group.label}`} className="sx-nav-group__label">{group.label}</h2>
              <div className="sx-nav-group__items">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = item.id === activeView;
                  const growthLabel = role === "agent" && item.id === "growth" ? "团队与佣金" : item.label;
                  return (
                    <button
                      key={item.id}
                      className="sx-nav-item"
                      type="button"
                      aria-current={active ? "page" : undefined}
                      aria-label={`${growthLabel}：${item.description}`}
                      title={collapsed ? growthLabel : undefined}
                      data-active={active ? "true" : "false"}
                      onClick={() => navigate(item.id)}
                    >
                      <span className="sx-nav-item__icon" aria-hidden="true">
                        <Icon size={19} weight={active ? "fill" : "duotone"} />
                      </span>
                      <span className="sx-nav-item__copy">
                        <strong>{growthLabel}</strong>
                        <small>{item.description}</small>
                      </span>
                      {item.id === "notifications" && safeUnreadCount > 0 ? (
                        <span className="sx-nav-item__count" aria-label={`${safeUnreadCount} 条未读消息`}>
                          {safeUnreadCount > 99 ? "99+" : safeUnreadCount}
                        </span>
                      ) : (
                        <CaretRight className="sx-nav-item__caret" size={13} weight="bold" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>

        <div className="sx-sidebar__footer">
          <button
            className="sx-sidebar__profile"
            type="button"
            title={collapsed ? userName : undefined}
            aria-label={`打开${userName}的设置`}
            onClick={() => navigate(settingsView)}
          >
            <span className="sx-avatar" aria-hidden="true">{initials}</span>
            <span className="sx-sidebar__profile-copy">
              <strong>{userName}</strong>
              <small>{role === "admin" ? "超级管理员" : role === "agent" ? "认证代理" : "星核创作者"}</small>
            </span>
            <CaretRight className="sx-sidebar__profile-caret" size={14} weight="bold" aria-hidden="true" />
          </button>
          <button className="sx-sidebar__logout" type="button" aria-label="退出登录" title="退出登录" onClick={onLogout}>
            <SignOut size={18} weight="duotone" aria-hidden="true" />
            <span>退出登录</span>
          </button>
        </div>

        <button
          className="sx-sidebar__collapse"
          type="button"
          aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          <SidebarSimple size={17} weight="duotone" aria-hidden="true" />
        </button>
      </aside>

      <header className="sx-topbar">
        <div className="sx-topbar__identity">
          <button
            className="sx-topbar__mobile-menu"
            type="button"
            aria-label="打开导航菜单"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <List size={21} weight="bold" />
          </button>
          <div className="sx-topbar__title">
            <span>{roleLabel[role]}</span>
            <h1>{current?.label ?? "星核工作区"}</h1>
          </div>
        </div>

        <div className="sx-topbar__actions">
          <div
            className={`sx-topbar__status sx-topbar__status--${runtimeStatus ?? "offline"}`}
            aria-label={runtimeMessage ?? "本地验收环境，生产适配器未配置"}
            title={runtimeMessage}
          >
            <span aria-hidden="true" />
            {runtimeStatus === "connected" ? "控制面在线" : runtimeStatus === "error" ? "控制面异常" : runtimeStatus === "idle" ? "连接校验中" : "本地验收"}
          </div>
          <button
            className={`sx-topbar__credits${lowCredits ? " sx-topbar__credits--low" : ""}`}
            type="button"
            aria-label={`${lowCredits ? "低额度预警，" : ""}可用能量 ${safeCredits.toLocaleString("zh-CN")}`}
            onClick={() => navigate(role === "admin" ? "admin-finance" : "wallet")}
          >
            <Coins size={18} weight="duotone" aria-hidden="true" />
            <span>能量</span>
            <strong>{safeCredits.toLocaleString("zh-CN")}</strong>
          </button>
          <button
            className="sx-topbar__icon-button"
            type="button"
            aria-label={safeUnreadCount > 0 ? `查看消息，${safeUnreadCount} 条未读` : "查看消息"}
            onClick={() => navigate(notificationView)}
          >
            <Bell size={19} weight="duotone" aria-hidden="true" />
            {safeUnreadCount > 0 ? <span>{safeUnreadCount > 99 ? "99+" : safeUnreadCount}</span> : null}
          </button>
          <button
            className="sx-topbar__account"
            type="button"
            aria-label={`打开${userName}的账户设置`}
            onClick={() => navigate(settingsView)}
          >
            <span className="sx-avatar" aria-hidden="true">{initials}</span>
            <span>{userName}</span>
            <UserCircle size={17} weight="duotone" aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className="sx-main" id="sx-main-content" tabIndex={-1}>
        <div className="sx-main__inner">{children}</div>
      </main>
    </div>
  );
}
