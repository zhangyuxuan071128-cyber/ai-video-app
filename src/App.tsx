import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import AuthPage from "./pages/AuthPage";
import { useAppStore } from "./state/AppStore";
import type { UserRole } from "./types/domain";
import { AppShell } from "./components/app";
import { getAdminPortalUrl } from "./config/portalUrls";
import "./styles/system.css";
import "./styles/shell.css";

const UserWorkspace = lazy(() =>
  import("./pages/user").then((module) => ({ default: module.UserWorkspace })),
);

const USER_VIEWS = new Set([
  "dashboard",
  "create",
  "tasks",
  "materials",
  "platforms",
  "wallet",
  "growth",
  "notifications",
  "support",
  "settings",
]);

function defaultView(_role: UserRole): string {
  return "dashboard";
}

function hashView(): string {
  if (typeof window === "undefined") return "";
  return window.location.hash.replace(/^#\/?/, "").trim();
}

function isAllowedView(role: UserRole, view: string): boolean {
  return role !== "admin" && USER_VIEWS.has(view);
}

function AdminPortalHandoff({ onLogout }: { onLogout: () => void }) {
  const adminPortalUrl = getAdminPortalUrl();

  useEffect(() => {
    if (adminPortalUrl) window.location.assign(adminPortalUrl);
  }, [adminPortalUrl]);

  return (
    <main className="fatal-state">
      <div className="fatal-state__panel">
        <span className="fatal-state__sigil" aria-hidden="true">◇</span>
        <h1>超级管理端已独立</h1>
        <p>管理员身份不再进入会员工作台，请从独立治理域完成高权限操作。</p>
        {adminPortalUrl ? <a href={adminPortalUrl}>打开超级管理中枢</a> : null}
        <button type="button" onClick={onLogout}>退出当前身份</button>
      </div>
    </main>
  );
}

type ErrorBoundaryState = { hasError: boolean; detail: string };

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, detail: "" };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      detail: error instanceof Error ? error.message : "未知界面错误",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Application render error", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="fatal-state">
        <div className="fatal-state__panel">
          <span className="fatal-state__sigil" aria-hidden="true">◇</span>
          <p className="fatal-state__eyebrow">界面保护已启动</p>
          <h1>当前模块未能正确载入</h1>
          <p>{this.state.detail}</p>
          <button type="button" onClick={() => window.location.reload()}>
            重新载入中枢
          </button>
        </div>
      </main>
    );
  }
}

function ProductApp() {
  const store = useAppStore();
  const role = store.currentUser?.role ?? "user";
  const [view, setView] = useState(() => {
    const requested = hashView();
    return isAllowedView(role, requested) ? requested : defaultView(role);
  });

  useEffect(() => {
    const root = document.documentElement;
    if (store.currentUser?.preferences.reducedMotion) {
      root.dataset.sxReducedMotion = "true";
    } else {
      delete root.dataset.sxReducedMotion;
    }
    return () => { delete root.dataset.sxReducedMotion; };
  }, [store.currentUser?.preferences.reducedMotion]);

  useEffect(() => {
    if (!store.currentUser) return;
    const next = isAllowedView(store.currentUser.role, view)
      ? view
      : defaultView(store.currentUser.role);
    if (next !== view) setView(next);
    if (hashView() !== next) window.history.replaceState(null, "", `#/${next}`);
  }, [store.currentUser, view]);

  useEffect(() => {
    const onHashChange = () => {
      if (!store.currentUser) return;
      const next = hashView();
      if (isAllowedView(store.currentUser.role, next)) setView(next);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [store.currentUser]);

  const navigate = useCallback((next: string) => {
    if (!store.currentUser || !isAllowedView(store.currentUser.role, next)) return;
    setView(next);
    window.history.pushState(null, "", `#/${next}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }, [store.currentUser]);

  const logout = useCallback(() => {
    store.logout();
    window.history.replaceState(null, "", "#/");
  }, [store]);

  const displayName = useMemo(
    () => store.currentUser?.nickname || store.currentUser?.username || "创作者",
    [store.currentUser],
  );

  if (!store.currentUser) return null;
  if (store.currentUser.role === "admin") return <AdminPortalHandoff onLogout={logout} />;

  return (
    <AppShell
      role={store.currentUser.role}
      userName={displayName}
      credits={store.availablePaidCredits}
      creditWarningThreshold={store.state.adminSettings.lowCreditWarningThreshold}
      unreadCount={store.unreadCount}
      runtimeStatus={store.controlPlaneStatus}
      runtimeMessage={store.controlPlaneMessage}
      activeView={view}
      onNavigate={navigate}
      onLogout={logout}
    >
      <Suspense
        fallback={(
          <section className="workspace-loading" aria-live="polite" aria-busy="true">
            <span className="workspace-loading__sigil" aria-hidden="true">◇</span>
            <p>正在校准创作星轨…</p>
          </section>
        )}
      >
        <UserWorkspace view={view} onNavigate={navigate} />
      </Suspense>
    </AppShell>
  );
}

function AuthGate() {
  const store = useAppStore();

  if (store.isAuthenticated && store.currentUser) {
    return <ProductApp />;
  }

  return (
    <AuthPage
      adminPortalUrl={getAdminPortalUrl()}
      runtimeLabel={
        store.controlPlaneStatus === "connected"
          ? "共享控制面已连接"
          : store.controlPlaneStatus === "offline"
            ? "本地验收后备模式"
            : store.controlPlaneStatus === "error"
              ? "认证服务已拒绝本次请求"
              : "登录时校验共享控制面"
      }
      onAuthenticate={async (username, password) => {
        const result = await store.login({ username, password });
        return {
          ok: result.ok,
          message: result.message,
          role: result.data?.user.role,
        };
      }}
      onRegister={async (payload) => {
        const result = await store.register(payload);
        return { ok: result.ok, message: result.message };
      }}
      onRequestResetCode={async (phone) => {
        return {
          ok: false,
          message: `手机号 ${phone.slice(0, 3)}****${phone.slice(-4)} 的在线短信适配器尚未配置，请联系超级管理员人工重置`,
        };
      }}
      onResetPassword={async () => {
        return { ok: false, message: "在线密码重置尚未启用，请联系超级管理员；本次未修改任何账号" };
      }}
    />
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthGate />
    </AppErrorBoundary>
  );
}
