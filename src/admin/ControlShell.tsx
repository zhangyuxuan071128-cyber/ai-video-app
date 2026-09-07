import {
  Archive,
  ArrowClockwise,
  BookOpenText,
  CaretRight,
  Cards,
  Command,
  Cube,
  Gauge,
  Key,
  List,
  MagnifyingGlass,
  Package,
  ShieldCheck,
  SignOut,
  SlidersHorizontal,
  UserCircle,
  UsersThree,
  X,
  type Icon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AdminIdentity, AdminView, EnvironmentSignal, NavItem } from "./types";
import { IconButton, StatusBadge, cx } from "./ui";

type AdminNavItem = NavItem & { icon: Icon };
type NavGroup = { label: string; items: AdminNavItem[] };

export const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    label: "态势",
    items: [{ id: "dashboard", label: "治理总览", shortLabel: "总览", description: "待介入与真实运行态势", keywords: "dashboard overview 异常 待办 首页", icon: Gauge }],
  },
  {
    label: "身份与额度",
    items: [
      { id: "members", label: "用户治理", shortLabel: "用户", description: "账号、角色与权限", keywords: "member user role 冻结 权限 配额", icon: UsersThree },
      { id: "codes", label: "额度卡码", shortLabel: "卡码", description: "邀请码与充值码", keywords: "invite recharge code 邀请 充值", icon: Cards },
      { id: "packages", label: "套餐", shortLabel: "套餐", description: "售卖套餐与额度规则", keywords: "package plan price credits 价格", icon: Package },
    ],
  },
  {
    label: "通道与内容",
    items: [
      { id: "providers", label: "模型聚合", shortLabel: "模型", description: "模型服务商与 Vault", keywords: "provider model api secret vault 平台", icon: Cube },
      { id: "partner-keys", label: "合伙人密钥池", shortLabel: "密钥池", description: "合伙人通道密钥", keywords: "partner key pool last4 密钥", icon: Key },
      { id: "content", label: "内容发布", shortLabel: "内容", description: "教程与公告", keywords: "tutorial announcement publish 教程 公告", icon: BookOpenText },
    ],
  },
  {
    label: "风险与追溯",
    items: [
      { id: "risk", label: "风险策略", shortLabel: "风控", description: "全局防护与限额", keywords: "risk policy security 风控 策略", icon: SlidersHorizontal },
      { id: "audit", label: "审计", shortLabel: "审计", description: "不可变操作记录", keywords: "audit log trace export 日志 追溯", icon: Archive },
    ],
  },
];

export const ADMIN_NAV_ITEMS = ADMIN_NAV_GROUPS.flatMap((group) => group.items);

function CoreMark() {
  return <span className="sa-core-mark" aria-hidden="true"><i /><b /></span>;
}

function CommandPalette({
  open,
  activeView,
  onClose,
  onNavigate,
}: {
  open: boolean;
  activeView: AdminView;
  onClose: () => void;
  onNavigate: (view: AdminView) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return ADMIN_NAV_ITEMS;
    return ADMIN_NAV_ITEMS.filter((item) => `${item.label} ${item.description} ${item.keywords}`.toLowerCase().includes(normalized));
  }, [query]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
    if (!open && dialog.open) dialog.close();
    if (!open) setQuery("");
  }, [open]);

  return <dialog ref={ref} className="sa-command" aria-label="全局命令搜索" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="sa-command__surface">
      <label className="sa-command__search"><MagnifyingGlass aria-hidden="true" /><span className="sa-sr-only">搜索管理模块</span><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模块、操作或能力…" onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); ref.current?.querySelector<HTMLButtonElement>(".sa-command__result")?.focus(); } }} /><kbd>⌘ K</kbd></label>
      <div className="sa-command__results">
        {results.map((item) => {
          const Glyph = item.icon;
          return <button type="button" className="sa-command__result" key={item.id} aria-current={activeView === item.id ? "page" : undefined} onClick={() => { onNavigate(item.id); onClose(); }}><span><Glyph weight="duotone" /></span><div><strong>{item.label}</strong><small>{item.description}</small></div><CaretRight aria-hidden="true" /></button>;
        })}
        {!results.length ? <div className="sa-command__empty"><Command /><strong>没有匹配命令</strong><p>尝试“用户”、“密钥”或“审计”。</p></div> : null}
      </div>
      <footer><span><kbd>↑</kbd><kbd>↓</kbd> 定位</span><span><kbd>ESC</kbd> 关闭</span></footer>
    </div>
  </dialog>;
}

export function AdminControlShell({
  identity,
  activeView,
  environment,
  refreshing,
  loggingOut,
  onNavigate,
  onRefresh,
  onLogout,
  children,
}: {
  identity: AdminIdentity;
  activeView: AdminView;
  environment: EnvironmentSignal;
  refreshing: boolean;
  loggingOut: boolean;
  onNavigate: (view: AdminView) => void;
  onRefresh: () => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(max-width: 860px)").matches);
  const drawerRef = useRef<HTMLElement>(null);
  const current = ADMIN_NAV_ITEMS.find((item) => item.id === activeView) ?? ADMIN_NAV_ITEMS[0];

  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 860px)");
    if (!media) return;
    const change = (event: MediaQueryListEvent) => { setMobile(event.matches); if (!event.matches) setDrawerOpen(false); };
    setMobile(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const drawer = drawerRef.current;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => drawer?.querySelector<HTMLButtonElement>(".sa-sidebar__close")?.focus());
    const focusableSelector = "button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";
    const trap = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setDrawerOpen(false); return; }
      if (event.key !== "Tab" || !drawer) return;
      const focusable = [...drawer.querySelectorAll<HTMLElement>(focusableSelector)].filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", trap);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [drawerOpen]);

  const navigate = (view: AdminView) => { onNavigate(view); setDrawerOpen(false); };
  const adapterTone = environment.adapterState === "ready" ? "success" : environment.adapterState === "unknown" ? "neutral" : "warning";

  return <div className="sa-shell" data-drawer={drawerOpen ? "open" : "closed"}>
    <a className="sa-skip" href="#sa-main">跳到主要内容</a>
    <div className="sa-ambient" aria-hidden="true"><span /><span /><i /><i /><i /></div>
    <button className="sa-scrim" type="button" aria-label="关闭导航" tabIndex={drawerOpen ? 0 : -1} aria-hidden={!drawerOpen} onClick={() => setDrawerOpen(false)} />

    <aside ref={drawerRef} className="sa-sidebar" aria-label={drawerOpen ? "移动管理导航" : "管理导航"} role={drawerOpen ? "dialog" : undefined} aria-modal={drawerOpen || undefined} aria-hidden={mobile && !drawerOpen ? true : undefined} inert={mobile && !drawerOpen ? true : undefined}>
      <header className="sa-sidebar__brand"><button type="button" onClick={() => navigate("dashboard")} aria-label="返回治理总览"><CoreMark /><span><strong>星核影枢</strong><small>CONTROL PLANE</small></span></button><IconButton className="sa-sidebar__close" label="关闭导航" icon={<X />} onClick={() => setDrawerOpen(false)} /></header>
      <div className="sa-sidebar__scope"><ShieldCheck weight="fill" /><span><strong>超级管理域</strong><small>真实治理接口</small></span></div>
      <nav className="sa-sidebar__nav">
        {ADMIN_NAV_GROUPS.map((group) => <section key={group.label} aria-labelledby={`sa-nav-${group.label}`}><h2 id={`sa-nav-${group.label}`}>{group.label}</h2><div>{group.items.map((item) => { const Glyph = item.icon; const active = item.id === activeView; return <button type="button" key={item.id} aria-current={active ? "page" : undefined} data-active={active || undefined} onClick={() => navigate(item.id)}><span aria-hidden="true"><Glyph weight={active ? "fill" : "duotone"} /></span><span><strong>{item.label}</strong><small>{item.description}</small></span><CaretRight aria-hidden="true" /></button>; })}</div></section>)}
      </nav>
      <footer className="sa-sidebar__footer"><div className="sa-admin-chip"><span>{identity.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{identity.displayName}</strong><small>@{identity.username}</small></div></div><button type="button" onClick={onLogout} disabled={loggingOut}><SignOut />{loggingOut ? "正在退出…" : "安全退出"}</button></footer>
    </aside>

    <header className="sa-topbar">
      <div className="sa-topbar__identity"><IconButton className="sa-menu" label="打开导航" icon={<List />} onClick={() => setDrawerOpen(true)} /><div><span>SUPER ADMIN / {current.shortLabel}</span><h1>{current.label}</h1></div></div>
      <div className="sa-topbar__actions">
        <button className="sa-command-trigger" type="button" onClick={() => setCommandOpen(true)}><MagnifyingGlass /><span>搜索模块与命令</span><kbd>⌘ K</kbd></button>
        <div className="sa-environment" aria-label={`环境 ${environment.environment}，${environment.adapterLabel}`}><span>{environment.environment}</span><StatusBadge tone={adapterTone}>{environment.adapterLabel}</StatusBadge></div>
        <IconButton label="刷新当前数据" icon={<ArrowClockwise className={refreshing ? "sa-spin" : undefined} />} disabled={refreshing} disabledReason="正在刷新" onClick={onRefresh} />
        <div className="sa-topbar__admin"><span>{identity.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{identity.displayName}</strong><small>超级管理员</small></div><UserCircle /></div>
      </div>
    </header>

    <main id="sa-main" className="sa-main" tabIndex={-1}><div className="sa-main__inner">{children}</div></main>
    <CommandPalette open={commandOpen} activeView={activeView} onClose={() => setCommandOpen(false)} onNavigate={navigate} />
  </div>;
}
