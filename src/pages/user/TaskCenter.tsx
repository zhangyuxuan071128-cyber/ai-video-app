import {
  Archive,
  ArrowClockwise,
  ArrowRight,
  CheckCircle,
  Clock,
  DownloadSimple,
  Eye,
  MagnifyingGlass,
  Pause,
  Play,
  Stack,
  WarningCircle,
  X,
  XCircle,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../state/AppStore";
import type { GenerationTask, TaskStage, TaskStatus } from "../../types/domain";
import {
  ActionButton,
  ConfirmDialog,
  DefinitionList,
  EmptyState,
  IconButton,
  PageHeader,
  Panel,
  ProgressBar,
  SignalBanner,
  StateChip,
  TabBar,
  formatFullDate,
  type Notify,
} from "./ui";

type TaskFilter = "all" | "active" | "completed" | "failed" | "archived";

const statusMeta: Record<TaskStatus, { label: string; tone: "neutral" | "good" | "warning" | "danger" | "accent" }> = {
  pending: { label: "待创建", tone: "neutral" },
  queued: { label: "排队中", tone: "accent" },
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
  compositing: "成片合成",
  packaging: "封装输出",
  done: "生产完成",
};

const modeLabel = {
  comic_drama: "AI 漫剧",
  commerce: "商业成片",
  digital_human: "数字人播报",
} as const;

function TaskRow({ task, selected, onSelect }: { task: GenerationTask; selected: boolean; onSelect: () => void }) {
  const meta = statusMeta[task.status];
  return (
    <button type="button" className={`uw-task-row${selected ? " is-selected" : ""}`} onClick={onSelect} aria-pressed={selected}>
      <span className="uw-task-row__signal" data-status={task.status} aria-hidden="true">
        {task.status === "failed" ? <WarningCircle weight="duotone" /> : task.status === "completed" ? <CheckCircle weight="duotone" /> : <Play weight="duotone" />}
      </span>
      <span className="uw-task-row__copy">
        <span className="uw-task-row__title"><strong>{task.title}</strong><StateChip label={meta.label} tone={meta.tone} pulse={task.status === "processing"} /></span>
        <span className="uw-task-row__meta">{modeLabel[task.input.mode]} · {task.input.batchCount} 集 · {task.input.aspectRatio} · {task.input.resolution}</span>
        {["pending", "queued", "processing"].includes(task.status) ? <ProgressBar value={task.progress} label={`${task.title}进度`} /> : null}
        {task.status === "failed" ? <span className="uw-task-row__failure">{task.errorMessage ?? "任务未完成，本次未扣除额度。"}</span> : null}
      </span>
      <span className="uw-task-row__time"><Clock weight="duotone" aria-hidden="true" />{formatFullDate(task.updatedAt)}</span>
      <ArrowRight className="uw-task-row__arrow" aria-hidden="true" />
    </button>
  );
}

export function TaskCenter({ onNavigate, notify }: { onNavigate: (view: string) => void; notify: Notify }) {
  const { userTasks, state, cancelTask, retryTask, archiveTask, tickTasks } = useAppStore();
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() => userTasks.find((task) => !task.isArchived)?.id ?? null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const counts = useMemo(() => ({
    all: userTasks.filter((task) => !task.isArchived).length,
    active: userTasks.filter((task) => !task.isArchived && ["pending", "queued", "processing"].includes(task.status)).length,
    completed: userTasks.filter((task) => !task.isArchived && task.status === "completed").length,
    failed: userTasks.filter((task) => !task.isArchived && task.status === "failed").length,
    archived: userTasks.filter((task) => task.isArchived).length,
  }), [userTasks]);

  const filteredTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return userTasks.filter((task) => {
      if (filter === "archived" ? !task.isArchived : task.isArchived) return false;
      if (filter === "active" && !["pending", "queued", "processing"].includes(task.status)) return false;
      if (filter === "completed" && task.status !== "completed") return false;
      if (filter === "failed" && task.status !== "failed") return false;
      if (!normalizedQuery) return true;
      return `${task.title} ${task.id} ${task.input.prompt}`.toLowerCase().includes(normalizedQuery);
    });
  }, [filter, query, userTasks]);

  useEffect(() => {
    if (selectedId && filteredTasks.some((task) => task.id === selectedId)) return;
    setSelectedId(filteredTasks[0]?.id ?? null);
  }, [filteredTasks, selectedId]);

  const selectedTask = userTasks.find((task) => task.id === selectedId) ?? null;
  const selectedPlatform = selectedTask ? state.platforms.find((platform) => platform.id === selectedTask.platformId) : null;
  const canCancel = selectedTask ? ["pending", "queued"].includes(selectedTask.status) : false;
  const canRetry = selectedTask?.status === "failed";
  const canArchive = selectedTask ? ["completed", "failed", "cancelled", "terminated"].includes(selectedTask.status) && !selectedTask.isArchived : false;

  const handleCancel = () => {
    if (!confirmCancelId) return;
    const result = cancelTask(confirmCancelId);
    setConfirmCancelId(null);
    notify(result.ok ? "success" : "error", result.message);
  };

  const handleRetry = () => {
    if (!selectedTask) return;
    const result = retryTask(selectedTask.id);
    notify(result.ok ? "success" : "error", result.message);
  };

  const handleArchive = () => {
    if (!selectedTask) return;
    const result = archiveTask(selectedTask.id);
    notify(result.ok ? "success" : "error", result.message);
  };

  const refresh = async () => {
    setRefreshing(true);
    tickTasks();
    await new Promise<void>((resolve) => window.setTimeout(resolve, 260));
    setRefreshing(false);
    notify("info", "本地任务状态已刷新。");
  };

  return (
    <div className="uw-page uw-tasks">
      <PageHeader
        title="任务观测台"
        description="跟踪每一条生产轨道的阶段、预留额度、失败原因与输出记录。"
        actions={<><ActionButton tone="secondary" icon={<ArrowClockwise />} busy={refreshing} onClick={refresh}>刷新状态</ActionButton><ActionButton tone="primary" onClick={() => onNavigate("create")}>新建任务</ActionButton></>}
      />

      <div className="uw-task-toolbar">
        <TabBar value={filter} onChange={setFilter} label="任务状态筛选" options={[
          { value: "all", label: "全部", count: counts.all },
          { value: "active", label: "进行中", count: counts.active },
          { value: "completed", label: "已完成", count: counts.completed },
          { value: "failed", label: "失败", count: counts.failed },
          { value: "archived", label: "已归档", count: counts.archived },
        ]} />
        <label className="uw-search-field"><MagnifyingGlass aria-hidden="true" /><span className="uw-sr-only">搜索任务</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、ID 或提示词" /></label>
      </div>

      <div className="uw-task-layout">
        <Panel className="uw-task-index" title={`${filteredTasks.length} 条任务`} description="任务顺序按最近更新时间排列">
          {filteredTasks.length ? <div className="uw-task-index__list">{filteredTasks.map((task) => <TaskRow key={task.id} task={task} selected={selectedId === task.id} onSelect={() => setSelectedId(task.id)} />)}</div> : <EmptyState icon={Stack} title="当前筛选没有任务" description={query ? "请调整搜索词或切换状态筛选。" : "创建新任务后，它会出现在这里。"} action={!query && filter === "all" ? <ActionButton tone="primary" onClick={() => onNavigate("create")}>创建任务</ActionButton> : <ActionButton tone="secondary" onClick={() => { setQuery(""); setFilter("all"); }}>清除筛选</ActionButton>} />}
        </Panel>

        <aside className="uw-task-detail" aria-label="任务详情">
          {selectedTask ? (
            <>
              <header className="uw-task-detail__header">
                <div><StateChip label={statusMeta[selectedTask.status].label} tone={statusMeta[selectedTask.status].tone} pulse={selectedTask.status === "processing"} /><h2>{selectedTask.title}</h2><p>{selectedTask.id}</p></div>
                <IconButton label="关闭任务详情" icon={<X />} onClick={() => setSelectedId(null)} />
              </header>
              {["pending", "queued", "processing"].includes(selectedTask.status) ? (
                <div className="uw-task-detail__progress">
                  <div><span>{stageLabel[selectedTask.stage]}</span><strong>{selectedTask.progress}%</strong></div>
                  <ProgressBar value={selectedTask.progress} label="当前任务总进度" />
                  <p>{selectedTask.status === "queued" && selectedTask.queuePosition ? `当前排队位置：${selectedTask.queuePosition}` : "任务由本地演示计时器驱动，未调用真实模型。"}</p>
                </div>
              ) : null}
              {selectedTask.status === "failed" ? <SignalBanner tone="error" title={selectedTask.errorCode ?? "TASK_FAILED"}>{selectedTask.errorMessage ?? "任务未完成，本次未扣除额度。"}</SignalBanner> : null}
              {selectedTask.status === "completed" ? <SignalBanner tone="success" title="输出已记录">{selectedTask.outputs.length} 个演示输出已写入任务，不包含可下载的真实媒体文件。</SignalBanner> : null}
              <DefinitionList items={[
                { term: "创作模式", value: modeLabel[selectedTask.input.mode] },
                { term: "生成平台", value: selectedPlatform?.name ?? "平台已移除" },
                { term: "成片规格", value: `${selectedTask.input.batchCount} 集 · ${selectedTask.input.aspectRatio} · ${selectedTask.input.resolution} · ${selectedTask.input.durationSeconds} 秒` },
                { term: "额度来源", value: selectedTask.creditSource === "paid" ? "共享创作额度" : "自有 API 配额" },
                { term: "预估 / 已扣", value: `${selectedTask.creditsEstimated} / ${selectedTask.creditsCharged}` },
                { term: "创建时间", value: formatFullDate(selectedTask.createdAt) },
                { term: "重试次数", value: `${selectedTask.retryCount} / ${selectedTask.maxRetries}` },
              ]} />
              <div className="uw-task-prompt">
                <span>创作提示</span><p>{selectedTask.input.prompt}</p>
                {selectedTask.input.dialogue ? <><span>台词 / 旁白</span><p>{selectedTask.input.dialogue}</p></> : null}
              </div>
              {selectedTask.outputs.length ? <div className="uw-output-list">
                <h3>输出记录</h3>
                {selectedTask.outputs.slice(0, 4).map((output) => <div key={output.id}><span><Eye weight="duotone" aria-hidden="true" /><span><strong>{output.title}</strong><small>{output.durationSeconds} 秒 · 演示记录</small></span></span><ActionButton tone="quiet" icon={<DownloadSimple />} disabled disabledReason="演示输出不包含真实媒体文件">下载</ActionButton></div>)}
                {selectedTask.outputs.length > 4 ? <p>还有 {selectedTask.outputs.length - 4} 个输出记录已折叠。</p> : null}
              </div> : null}
              <div className="uw-task-detail__actions">
                <ActionButton tone="secondary" icon={<Pause />} onClick={() => setConfirmCancelId(selectedTask.id)} disabled={!canCancel} disabledReason="只能取消待创建或排队中的任务">取消任务</ActionButton>
                <ActionButton tone="primary" icon={<ArrowClockwise />} onClick={handleRetry} disabled={!canRetry} disabledReason="只有失败任务可以重试">重试任务</ActionButton>
                <ActionButton tone="quiet" icon={<Archive />} onClick={handleArchive} disabled={!canArchive} disabledReason={selectedTask.isArchived ? "该任务已归档" : "进行中的任务不能归档"}>归档</ActionButton>
              </div>
            </>
          ) : (
            <EmptyState icon={Eye} title="选择一条任务" description="任务的进度、异常原因和配置会在这里展开。" />
          )}
        </aside>
      </div>

      <ConfirmDialog open={Boolean(confirmCancelId)} title="取消这条任务？" description="只有待创建或排队中的任务可取消，取消后不会扣除额度。" confirmLabel="确认取消" onConfirm={handleCancel} onCancel={() => setConfirmCancelId(null)} />
    </div>
  );
}
