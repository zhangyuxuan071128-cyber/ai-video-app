import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../state/AppStore";
import "../../styles/user.css";
import { Toast, type NoticeTone } from "./ui";

const CreateStudio = lazy(() => import("./CreateStudio").then((module) => ({ default: module.CreateStudio })));
const Dashboard = lazy(() => import("./Dashboard").then((module) => ({ default: module.Dashboard })));
const GrowthCenter = lazy(() => import("./GrowthCenter").then((module) => ({ default: module.GrowthCenter })));
const MaterialVault = lazy(() => import("./MaterialVault").then((module) => ({ default: module.MaterialVault })));
const NotificationCenter = lazy(() => import("./NotificationCenter").then((module) => ({ default: module.NotificationCenter })));
const PlatformMatrix = lazy(() => import("./PlatformMatrix").then((module) => ({ default: module.PlatformMatrix })));
const SettingsCenter = lazy(() => import("./SettingsCenter").then((module) => ({ default: module.SettingsCenter })));
const SupportCenter = lazy(() => import("./SupportCenter").then((module) => ({ default: module.SupportCenter })));
const TaskCenter = lazy(() => import("./TaskCenter").then((module) => ({ default: module.TaskCenter })));
const WalletCenter = lazy(() => import("./WalletCenter").then((module) => ({ default: module.WalletCenter })));

export interface UserWorkspaceProps {
  view: string;
  onNavigate: (view: string) => void;
}

const VIEW_ALIASES: Record<string, string> = {
  home: "dashboard",
  workspace: "dashboard",
  batch: "create",
  wizard: "create",
  task: "tasks",
  library: "materials",
  recycle: "materials",
  connections: "platforms",
  connection: "platforms",
  billing: "wallet",
  recharge: "wallet",
  affiliate: "growth",
  referrals: "growth",
  commission: "growth",
  tutorials: "support",
  feedback: "support",
  preferences: "settings",
};

function normalizeView(view: string): string {
  const raw = view.replace(/^\/+/, "").split(/[/?#]/)[0] || "dashboard";
  return VIEW_ALIASES[raw] ?? raw;
}

export function UserWorkspace({ view, onNavigate }: UserWorkspaceProps) {
  const store = useAppStore();
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const activeView = normalizeView(view);
  const notify = useCallback((tone: NoticeTone, message: string) => {
    setNotice({ tone, message });
  }, []);

  useEffect(() => {
    const main = document.getElementById("sx-main-content");
    main?.scrollTo({ top: 0, behavior: "auto" });
  }, [activeView]);

  const content = useMemo(() => {
    const props = { onNavigate, notify };
    switch (activeView) {
      case "create":
        return <CreateStudio {...props} />;
      case "tasks":
        return <TaskCenter {...props} />;
      case "materials":
        return <MaterialVault {...props} />;
      case "platforms":
        return <PlatformMatrix {...props} />;
      case "wallet":
        return <WalletCenter {...props} />;
      case "growth":
        return <GrowthCenter {...props} />;
      case "notifications":
        return <NotificationCenter {...props} />;
      case "support":
        return <SupportCenter {...props} />;
      case "settings":
        return <SettingsCenter {...props} />;
      case "dashboard":
      default:
        return <Dashboard {...props} />;
    }
  }, [activeView, notify, onNavigate]);

  if (!store.currentUser) {
    return (
      <div className="uw uw--unauthenticated">
        <div className="uw-access-shield">
          <h1>会话已失效</h1>
          <p>当前无法读取创作工作台，请返回登录界面重新验证身份。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="uw" data-view={activeView}>
      <div className="uw__ambient" aria-hidden="true">
        <span className="uw__orbit uw__orbit--one" />
        <span className="uw__orbit uw__orbit--two" />
        <span className="uw__beacon" />
      </div>
      <Suspense
        fallback={(
          <div className="uw-module-loading" role="status" aria-live="polite">
            <span aria-hidden="true">◇</span>
            <p>正在载入星轨模块…</p>
          </div>
        )}
      >
        <div className="uw__content" key={activeView}>{content}</div>
      </Suspense>
      {notice ? <Toast tone={notice.tone} message={notice.message} onDismiss={() => setNotice(null)} /> : null}
    </div>
  );
}

export default UserWorkspace;
