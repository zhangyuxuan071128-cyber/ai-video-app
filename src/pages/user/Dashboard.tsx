import {
  ArrowRight,
  Bell,
  CheckCircle,
  Coins,
  FolderOpen,
  MagicWand,
  Plug,
  Pulse,
  RocketLaunch,
  Stack,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMemo, type CSSProperties } from "react";
import { useAppStore } from "../../state/AppStore";
import type { GenerationTask, TaskStage, TaskStatus } from "../../types/domain";
import {
  ActionButton,
  EmptyState,
  Metric,
  PageHeader,
  Panel,
  ProgressBar,
  SignalBanner,
  StateChip,
  formatDateTime,
  type Notify,
} from "./ui";

const taskStatusMeta: Record<TaskStatus, { label: string; tone: "neutral" | "good" | "warning" | "danger" | "accent" }> = {
  pending: { label: "待创建", tone: "neutral" },
  queued: { label: "已排队", tone: "accent" },
  processing: { label: "生成中", tone: "accent" },
  completed: { label: "已完成", tone: "good" },
  failed: { label: "失败", tone: "danger" },
  cancelled: { label: "已取消", tone: "neutral" },
  terminated: { label: "已终止", tone: "danger" },
};

const stageLabel: Record<TaskStage, string> = {
  preparing: "准备参数",
  parsing: "解析素材",
  storyboarding: "编排分镜",
  generating_visuals: "生成画面",
  synthesizing_voice: "合成音轨",
  compositing: "视频合成",
  packaging: "封装成片",
  done: "已完成",
};

function TaskPulse({ task, onOpen }: { task: GenerationTask; onOpen: () => void }) {
  const meta = taskStatusMeta[task.status];
  return (
    <article className="uw-task-pulse">
      <div className="uw-task-pulse__mark" aria-hidden="true">
        {task.status === "failed" ? <WarningCircle weight="duotone" /> : task.status === "completed" ? <CheckCircle weight="duotone" /> : <Pulse weight="duotone" />}
      </div>
      <div className="uw-task-pulse__main">
        <div className="uw-task-pulse__title">
          <h3>{task.title}</h3>
          <StateChip label={meta.label} tone={meta.tone} pulse={task.status === "processing"} />
        </div>
        <p>{stageLabel[task.stage]} · {task.input.batchCount} 集 · {task.input.resolution}</p>
        {task.status === "processing" || task.status === "queued" || task.status === "pending" ? <ProgressBar value={task.progress} label={`${task.title}处理进度`} /> : null}
        {task.status === "failed" && task.errorMessage ? <span className="uw-task-pulse__error">{task.errorMessage}</span> : null}
      </div>
      <button type="button" className="uw-link-button" onClick={onOpen} aria-label={`查看任务：${task.title}`}>
        查看 <ArrowRight aria-hidden="true" />
      </button>
    </article>
  );
}

export function Dashboard({ onNavigate }: { onNavigate: (view: string) => void; notify: Notify }) {
  const {
    currentUser,
    userTasks,
    userMaterials,
    userConnections,
    unreadCount,
    availablePaidCredits,
    reservedPaidCredits,
    controlPlaneStatus,
    controlPlaneMessage,
    state,
  } = useAppStore();

  const activeTasks = useMemo(
    () => userTasks.filter((task) => !task.isArchived && ["pending", "queued", "processing"].includes(task.status)),
    [userTasks],
  );
  const recentTasks = useMemo(
    () => userTasks.filter((task) => !task.isArchived).slice(0, 4),
    [userTasks],
  );
  const completedCount = userTasks.filter((task) => task.status === "completed").length;
  const failedCount = userTasks.filter((task) => task.status === "failed").length;
  const connectedCount = userConnections.filter((item) => ["connected", "degraded"].includes(item.status)).length;
  const activeAnnouncement = state.announcements
    .filter((item) => item.isActive && Date.parse(item.startsAt) <= Date.now() && Date.parse(item.endsAt) > Date.now())
    .sort((a, b) => a.sortOrder - b.sortOrder)[0];
  const userLabel = currentUser?.nickname ?? "创作者";
  const isManaged = currentUser?.authKind === "server";

  return (
    <div className="uw-page uw-dashboard">
      <PageHeader
        title="创作指挥舱"
        description={`${userLabel}，这里展示${isManaged ? "共享控制面" : "本地验收环境"}的任务、额度和连接状态。`}
        aside={<StateChip label={isManaged ? "共享控制面" : "V7.1 本地验收"} tone={controlPlaneStatus === "error" ? "danger" : "accent"} />}
      />

      {isManaged ? (
        <SignalBanner tone={controlPlaneStatus === "connected" ? "info" : "error"} title={controlPlaneStatus === "connected" ? "会员数据已与超级管理端联通" : "共享控制面需要处理"}>
          {controlPlaneMessage}。真实生成适配器当前仍未安装，系统不会伪造任务、产物或扣费。
        </SignalBanner>
      ) : null}

      {activeAnnouncement ? (
        <SignalBanner
          tone="info"
          title={activeAnnouncement.title}
          actions={<ActionButton tone="quiet" onClick={() => onNavigate("support")} icon={<ArrowRight />}>查看指南</ActionButton>}
        >
          {activeAnnouncement.content}
        </SignalBanner>
      ) : null}

      <section className="uw-command-deck" aria-labelledby="command-title">
        <div className="uw-command-deck__copy">
          <div className="uw-command-deck__signal" aria-hidden="true"><RocketLaunch weight="duotone" /></div>
          <h2 id="command-title">把一个构思，编排成一条可跟踪的成片轨道。</h2>
          <p>选择漫剧、商业成片或数字人播报，一次创建 1–15 集任务。每一次扣额、重试和连接状态都有明确记录。</p>
          <div className="uw-command-deck__actions">
            <ActionButton tone="primary" icon={<MagicWand weight="duotone" />} onClick={() => onNavigate("create")}>新建批量任务</ActionButton>
            <ActionButton tone="secondary" icon={<Stack weight="duotone" />} onClick={() => onNavigate("tasks")}>进入任务中心</ActionButton>
          </div>
        </div>
        <div className="uw-orbit-console" aria-label="当前生产轨道摘要">
          <div className="uw-orbit-console__rings" aria-hidden="true">
            <span /><span /><span />
          </div>
          <div className="uw-orbit-console__core">
            <strong>{activeTasks.length}</strong>
            <span>进行中任务</span>
          </div>
          <div className="uw-orbit-console__node uw-orbit-console__node--one"><span>{connectedCount}</span>连接</div>
          <div className="uw-orbit-console__node uw-orbit-console__node--two"><span>{unreadCount}</span>消息</div>
          <div className="uw-orbit-console__node uw-orbit-console__node--three"><span>{availablePaidCredits}</span>可用</div>
        </div>
      </section>

      <section className="uw-metric-rail" aria-label="工作台实时摘要">
        <Metric label="可用共享额度" value={availablePaidCredits} note={reservedPaidCredits ? `另有 ${reservedPaidCredits} 次被任务预留` : "当前无预留额度"} icon={<Coins weight="duotone" />} />
        <Metric label="已完成成片" value={completedCount} note={`${userTasks.length} 条历史任务`} icon={<CheckCircle weight="duotone" />} />
        <Metric label="素材库" value={userMaterials.filter((item) => !item.isDeleted).length} note={`${userMaterials.filter((item) => item.isDeleted).length} 项在回收站`} icon={<FolderOpen weight="duotone" />} />
        <Metric label="需要处理" value={failedCount + unreadCount} note={`${failedCount} 个失败任务 · ${unreadCount} 条未读`} icon={<Bell weight="duotone" />} />
      </section>

      <div className="uw-dashboard-grid">
        <Panel
          title="生产轨道"
          description="最近任务的进度、阶段和异常状态"
          actions={<ActionButton tone="quiet" onClick={() => onNavigate("tasks")} icon={<ArrowRight />}>全部任务</ActionButton>}
          className="uw-panel--tasks"
        >
          {recentTasks.length ? (
            <div className="uw-task-pulse-list">
              {recentTasks.map((task) => <TaskPulse task={task} key={task.id} onOpen={() => onNavigate("tasks")} />)}
            </div>
          ) : (
            <EmptyState icon={Stack} title="生产轨道尚未启动" description="创建第一个批量任务后，进度会出现在这里。" action={<ActionButton tone="primary" onClick={() => onNavigate("create")}>创建任务</ActionButton>} />
          )}
        </Panel>

        <div className="uw-dashboard-grid__side">
          <Panel title="接入矩阵" description={isManaged ? "状态由超级管理端发布；未配置的供应商不会显示为在线" : "仅展示本地验收连接，不代表真实供应商在线"}>
            <div className="uw-connection-summary">
              {state.platforms.slice(0, 6).map((platform) => {
                const connection = userConnections.find((item) => item.platformId === platform.id);
                const connected = connection && ["connected", "degraded"].includes(connection.status);
                return (
                  <button type="button" key={platform.id} className="uw-platform-pip" onClick={() => onNavigate("platforms")} aria-label={`查看 ${platform.name} 连接`}>
                    <span style={{ "--platform-accent": platform.accent } as CSSProperties}>{platform.iconGlyph}</span>
                    <small>{platform.shortName}</small>
                    <i className={connected ? "is-connected" : ""} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            <div className="uw-dashboard-note">
              <Plug weight="duotone" aria-hidden="true" />
              <div><strong>{connectedCount} 条{isManaged ? "可用" : "本地验收"}通道</strong><span>{isManaged ? "供应商适配器未安装时，创建与测试操作会被明确阻断。" : "自有 API 任务仍受用户与平台每日配额双重限制。"}</span></div>
            </div>
            <ActionButton tone="secondary" onClick={() => onNavigate("platforms")} icon={<Plug weight="duotone" />}>管理平台连接</ActionButton>
          </Panel>

          <Panel title="最后一次生产信号" description={isManaged ? "账户和运营配置来自共享控制面" : "数据来自当前本地存储"}>
            <div className="uw-last-signal">
              <span className="uw-last-signal__beam" aria-hidden="true" />
              <strong>{userTasks[0]?.title ?? "暂无任务记录"}</strong>
              <span>{userTasks[0] ? formatDateTime(userTasks[0].updatedAt) : "启动创作后将生成时间轴"}</span>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
