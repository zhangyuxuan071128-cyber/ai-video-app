import { Component, useCallback, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from "react";
import { controlApi, displayError, readEnvironment } from "./api";
import { AdminLogin, RotatePassword } from "./AuthScreens";
import { ADMIN_NAV_ITEMS, AdminControlShell } from "./ControlShell";
import type { AdminIdentity, AdminView, Notice, ResourceState } from "./types";
import { ConfirmDialog, ToastRegion, type Confirmation } from "./ui";
import { AuditView } from "./views/AuditView";
import { CodesView } from "./views/CodesView";
import { ContentView } from "./views/ContentView";
import { DashboardView } from "./views/DashboardView";
import { MembersView } from "./views/MembersView";
import { PackagesView } from "./views/PackagesView";
import { PartnerKeysView } from "./views/PartnerKeysView";
import { ProvidersView } from "./views/ProvidersView";
import { RiskView } from "./views/RiskView";

const allowedViews = new Set<AdminView>(ADMIN_NAV_ITEMS.map((item) => item.id));

function hashView(): AdminView {
  const raw = window.location.hash.replace(/^#\/?/, "").split(/[/?]/)[0];
  return allowedViews.has(raw as AdminView) ? raw as AdminView : "dashboard";
}

function assertSuperAdmin(identity: AdminIdentity) {
  if (!["admin", "superadmin", "super_admin"].includes(identity.role.toLowerCase())) {
    throw new Error("该账号不具备超级管理员权限，已拒绝进入独立治理端。");
  }
}

type BoundaryState = { failed: boolean; message: string };

class AdminErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false, message: "" };
  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { failed: true, message: error instanceof Error ? error.message : "未知管理界面错误" };
  }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("Admin control render failure", error, info.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="sa-fatal"><section><span aria-hidden="true">◇</span><small>CONTROL UI SAFETY HALT</small><h1>治理界面已安全中止</h1><p>{this.state.message}</p><button type="button" onClick={() => window.location.reload()}>重新载入治理端</button></section></main>;
  }
}

function ControlApplication() {
  const [session, setSession] = useState<"checking" | "anonymous" | "authenticated">("checking");
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [sessionMessage, setSessionMessage] = useState("");
  const [view, setView] = useState<AdminView>(() => hashView());
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [dashboard, setDashboard] = useState<ResourceState<unknown>>({ status: "idle", data: {}, error: "" });
  const [notices, setNotices] = useState<Notice[]>([]);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const notify = useCallback((tone: Notice["tone"], title: string, message?: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setNotices((items) => [...items.slice(-2), { id, tone, title, message }]);
    window.setTimeout(() => setNotices((items) => items.filter((item) => item.id !== id)), tone === "error" ? 6200 : 4200);
  }, []);

  const loadDashboard = useCallback(async () => {
    setDashboard((current) => ({ ...current, status: "loading", error: "", errorCode: undefined }));
    try {
      const data = await controlApi.dashboard();
      setDashboard({ status: "success", data, error: "" });
    } catch (error) {
      const detail = displayError(error);
      setDashboard((current) => ({ ...current, status: "error", error: detail.message, errorCode: detail.code }));
    }
  }, []);

  useEffect(() => {
    let active = true;
    controlApi.me().then((admin) => {
      if (!active) return;
      assertSuperAdmin(admin);
      setIdentity(admin);
      setSession("authenticated");
    }).catch(() => { if (active) setSession("anonymous"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (session === "authenticated" && identity && !identity.mustRotatePassword) void loadDashboard();
  }, [session, identity?.id, identity?.mustRotatePassword, refreshKey, loadDashboard]);

  useEffect(() => {
    const change = () => setView(hashView());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);

  useEffect(() => {
    document.getElementById("sa-main")?.scrollTo({ top: 0, behavior: "auto" });
  }, [view]);

  const navigate = useCallback((next: AdminView) => {
    if (!allowedViews.has(next)) return;
    setView(next);
    if (hashView() !== next) window.history.pushState(null, "", `#/${next}`);
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const loggedIn = await controlApi.login({ username, password });
      assertSuperAdmin(loggedIn);
      const verified = await controlApi.me();
      assertSuperAdmin(verified);
      setIdentity(verified);
      setSessionMessage("");
      setSession("authenticated");
      window.history.replaceState(null, "", "#/dashboard");
      setView("dashboard");
    } catch (error) {
      try { await controlApi.logout(); } catch { /* The rejected session is cleared locally below. */ }
      setIdentity(null);
      setSession("anonymous");
      throw new Error(displayError(error).message);
    }
  };

  const rotate = async (currentPassword: string, newPassword: string) => {
    try {
      await controlApi.rotatePassword({ currentPassword, newPassword });
      const verified = await controlApi.me();
      assertSuperAdmin(verified);
      if (verified.mustRotatePassword) throw new Error("控制面仍要求轮换密码，请联系安全管理员。");
      setIdentity(verified);
      notify("success", "密码轮换成功", "治理数据已解锁。");
    } catch (error) { throw new Error(displayError(error).message); }
  };

  const logout = async () => {
    setLoggingOut(true);
    try { await controlApi.logout(); }
    catch (error) { setSessionMessage(`退出请求未完整返回：${displayError(error).message}`); }
    finally {
      setIdentity(null);
      setSession("anonymous");
      setLoggingOut(false);
      setDashboard({ status: "idle", data: {}, error: "" });
      window.history.replaceState(null, "", "#/login");
    }
  };

  const refresh = () => {
    setRefreshing(true);
    setRefreshKey((value) => value + 1);
    window.setTimeout(() => setRefreshing(false), 500);
  };

  const environment = useMemo(() => readEnvironment(dashboard.status === "success" ? dashboard.data : {}), [dashboard]);
  const common = { refreshKey, notify, requestConfirmation: setConfirmation };

  if (session === "checking") return <main className="sa-bootstrap" role="status" aria-live="polite"><span aria-hidden="true">◇</span><strong>正在验证管理会话</strong><p>不会在验证完成前加载治理数据。</p></main>;
  if (session === "anonymous" || !identity) return <AdminLogin initialMessage={sessionMessage} onLogin={login} />;
  if (identity.mustRotatePassword) return <RotatePassword identity={identity} onRotate={rotate} />;

  return <AdminControlShell identity={identity} activeView={view} environment={environment} refreshing={refreshing} loggingOut={loggingOut} onNavigate={navigate} onRefresh={refresh} onLogout={logout}>
    {view === "dashboard" ? <DashboardView state={dashboard} onNavigate={navigate} onRetry={loadDashboard} /> : null}
    {view === "members" ? <MembersView {...common} /> : null}
    {view === "codes" ? <CodesView {...common} /> : null}
    {view === "packages" ? <PackagesView {...common} /> : null}
    {view === "providers" ? <ProvidersView {...common} /> : null}
    {view === "partner-keys" ? <PartnerKeysView {...common} /> : null}
    {view === "content" ? <ContentView {...common} /> : null}
    {view === "risk" ? <RiskView {...common} /> : null}
    {view === "audit" ? <AuditView {...common} /> : null}
    <ToastRegion notices={notices} dismiss={(id) => setNotices((items) => items.filter((item) => item.id !== id))} />
    <ConfirmDialog pending={confirmation} onClose={() => setConfirmation(null)} />
  </AdminControlShell>;
}

export default function AdminApp() {
  return <AdminErrorBoundary><ControlApplication /></AdminErrorBoundary>;
}
